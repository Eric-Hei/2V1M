import { randomBytes, randomUUID } from 'node:crypto';
import { Storage } from './storage.mjs';

const PARTY_TTL_MS = 24 * 60 * 60 * 1000;

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed 0, 1, I, O to avoid confusion

function code() {
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return result;
}

function nowIso() {
  return new Date().toISOString();
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

export class GameStore {
  constructor() {
    this.storage = new Storage();

    // Pour le mode memory, on garde des références directes pour compatibilité
    // En mode Redis, ces Maps ne seront pas utilisées
    if (!this.storage.useRedis) {
      this.partiesById = this.storage.memory.partiesById;
      this.partiesByCode = this.storage.memory.partiesByCode;
      this.players = this.storage.memory.players;
      this.rounds = this.storage.memory.rounds;
      this.statements = this.storage.memory.statements;
      this.votes = this.storage.memory.votes;
    } else {
      // En mode Redis, créer des Maps vides pour éviter les erreurs
      this.partiesById = new Map();
      this.partiesByCode = new Map();
      this.players = new Map();
      this.rounds = new Map();
      this.statements = new Map();
      this.votes = new Map();
    }
  }

  // ========== SESSION MANAGEMENT ==========

  async createSession(playerId, code) {
    const token = randomUUID();
    const session = { playerId, code: code.toUpperCase(), createdAt: new Date().toISOString() };
    await this.storage.setSession(token, session);
    return token;
  }

  async getSession(token) {
    return await this.storage.getSession(token);
  }

  async deleteSession(token) {
    await this.storage.deleteSession(token);
  }

  async createParty({ code: customCode = null, groups: groupsParam, roundTimerSec: roundTimerSecParam, phaseTimeLimitSec: phaseTimeLimitSecParam, statementTimeLimitSec: statementTimeLimitSecParam } = {}) {
    // Apply defaults
    const groups = groupsParam ?? 0;
    const roundTimerSec = roundTimerSecParam ?? 120;
    const phaseTimeLimitSec = phaseTimeLimitSecParam ?? 600;
    const statementTimeLimitSec = statementTimeLimitSecParam ?? 120;

    if (!Number.isInteger(groups) || groups < 0 || groups > 20) {
      throw badRequest('groups must be an integer between 0 and 20');
    }
    if (!Number.isInteger(roundTimerSec) || roundTimerSec < 30 || roundTimerSec > 300) {
      throw badRequest('roundTimerSec must be between 30 and 300');
    }
    if (!Number.isInteger(phaseTimeLimitSec) || phaseTimeLimitSec < 60 || phaseTimeLimitSec > 3600) {
      throw badRequest('phaseTimeLimitSec must be between 60 and 3600');
    }
    if (!Number.isInteger(statementTimeLimitSec) || statementTimeLimitSec < 30 || statementTimeLimitSec > 600) {
      throw badRequest('statementTimeLimitSec must be between 30 and 600');
    }

    let partyCode;
    if (customCode) {
      const requestedCode = customCode.toUpperCase().trim();
      if (!/^[A-Z0-9]{3,9}$/.test(requestedCode)) {
        throw badRequest('Custom code must be 3-9 alphanumeric characters');
      }
      if (await this.storage.partyCodeExists(requestedCode)) {
        throw conflict('Party code already exists');
      }
      partyCode = requestedCode;
    } else {
      partyCode = code();
      while (await this.storage.partyCodeExists(partyCode)) {
        partyCode = code();
      }
    }

    const partyId = randomUUID();
    const groupIds = Array.from({ length: groups }, () => randomUUID());
    const party = {
      id: partyId,
      code: partyCode,
      status: 'LOBBY',
      phase2Multiplier: 2,
      roundTimerSec,
      phaseTimeLimitSec,
      statementTimeLimitSec,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + PARTY_TTL_MS).toISOString(),
      groups: groupIds.map((id, idx) => ({ id, idx: idx + 1, status: 'WAITING' })),
      players: [],
      roundsByGroup: new Map(),
      phase2Rounds: [],
      currentPhase2RoundIndex: -1,
      scores: new Map(),
      leakScores: new Map(),
      seenNarrators: new Map(),
      hostPlayerId: null,
      roundHistory: [],
      phase1Prep: {
        startedAt: null,
        deadlineAt: null,
        completedAt: null,
        completionReason: null,
        statementsByPlayerId: new Map(),
      },
      phase1: {
        startedAt: null,
        deadlineAt: null,
        completedAt: null,
        completionReason: null,
      },
      phase2: {
        startedAt: null,
        deadlineAt: null,
        completedAt: null,
        completionReason: null,
      },
    };

    await this.storage.setParty(partyId, party);

    return {
      partyId,
      code: partyCode,
      joinUrl: `/join/${partyCode}`,
    };
  }

  async getPartyByCode(partyCode) {
    return await this.storage.getPartyByCode(partyCode);
  }

  async getPartySnapshot(codeValue) {
    const party = await this.getPartyByCode(codeValue);
    if (!party) return null;
    return this.#snapshot(party);
  }

  enforceDeadlines(nowMs = Date.now()) {
    const changedParties = [];

    for (const party of this.partiesById.values()) {
      let changed = false;

      if (party.status === 'RUNNING_PHASE1_PREP' && !party.phase1Prep.completedAt && party.phase1Prep.deadlineAt) {
        if (new Date(party.phase1Prep.deadlineAt).getTime() <= nowMs) {
          this.#finalizePhase1Prep(party, 'time_limit');
          changed = true;
        }
      }

      if (party.status === 'RUNNING_PHASE1' && !party.phase1.completedAt && party.phase1.deadlineAt) {
        if (new Date(party.phase1.deadlineAt).getTime() <= nowMs) {
          this.#forceFinishPhase1ByTimeout(party);
          changed = true;
        }
      }

      if (party.status === 'RUNNING_PHASE2' && !party.phase2.completedAt && party.phase2.deadlineAt) {
        if (new Date(party.phase2.deadlineAt).getTime() <= nowMs) {
          this.#forceFinishPhase2ByTimeout(party);
          changed = true;
        }
      }

      if (changed) {
        changedParties.push(this.#snapshot(party));
      }
    }

    return changedParties;
  }

  async joinParty(codeValue, nickname, { groupId = null, groupIndex = null, createGroup = false } = {}) {
    const party = await this.getPartyByCode(codeValue);
    if (!party) throw badRequest('party not found');
    if (party.status !== 'LOBBY') throw conflict('party already started');
    const cleaned = (nickname || '').trim();
    if (!cleaned || cleaned.length > 32) {
      throw badRequest('nickname required (1-32 chars)');
    }

    if (party.players.some((p) => p.nickname.toLowerCase() === cleaned.toLowerCase())) {
      throw conflict('nickname already used in this party');
    }

    const playerId = randomUUID();
    let targetGroup = null;

    if (createGroup) {
      targetGroup = this.#createGroup(party);
    } else if (groupId) {
      targetGroup = party.groups.find((g) => g.id === groupId) ?? null;
      if (!targetGroup) throw badRequest('groupId not found');
    } else if (Number.isInteger(groupIndex) && groupIndex >= 1) {
      targetGroup = party.groups.find((g) => g.idx === groupIndex) ?? null;
      if (!targetGroup) throw badRequest('groupIndex not found');
    } else if (party.groups.length === 0) {
      targetGroup = this.#createGroup(party);
    } else {
      // Legacy fallback for preconfigured parties without explicit join choice.
      targetGroup = this.#nextGroupForJoin(party);
    }
    const player = {
      id: playerId,
      partyId: party.id,
      groupId: targetGroup.id,
      nickname: cleaned,
      isHost: party.players.length === 0,
      connected: true,
      createdAt: nowIso(),
    };

    party.players.push(player);
    party.scores.set(playerId, { phase1: 0, phase2: 0, total: 0 });
    party.seenNarrators.set(playerId, new Set());

    if (player.isHost) {
      party.hostPlayerId = playerId;
    }

    await this.storage.setPlayer(playerId, player);
    await this.storage.setParty(party.id, party);

    return { playerId, isHost: player.isHost, groupId: player.groupId };
  }

  async removePlayer(codeValue, playerId) {
    const party = await this.getPartyByCode(codeValue);
    if (!party) throw badRequest('party not found');
    if (party.status !== 'LOBBY') {
      throw conflict('player removal is only allowed in lobby');
    }

    const idx = party.players.findIndex((p) => p.id === playerId);
    if (idx === -1) throw badRequest('player not found in party');

    const [removed] = party.players.splice(idx, 1);
    await this.storage.deletePlayer(playerId);
    party.scores.delete(playerId);
    party.leakScores.delete(playerId);
    party.seenNarrators.delete(playerId);
    party.phase1Prep.statementsByPlayerId.delete(playerId);
    for (const seen of party.seenNarrators.values()) seen.delete(playerId);

    if (removed.isHost) {
      party.hostPlayerId = party.players[0]?.id ?? null;
      for (const p of party.players) p.isHost = p.id === party.hostPlayerId;
    }

    await this.storage.setParty(party.id, party);
    return this.#snapshot(party);
  }

  async startPhase1(codeValue, hostPlayerId) {
    console.log(`[startPhase1] Called for party ${codeValue} by player ${hostPlayerId}`);
    const party = await this.getPartyByCode(codeValue);
    if (!party) throw badRequest('party not found');
    return await this.#startPhase1WithParty(party, hostPlayerId);
  }

  async #startPhase1WithParty(party, hostPlayerId) {
    console.log(`[#startPhase1WithParty] Called for party ${party.code} by player ${hostPlayerId}`);
    this.#assertPartyMember(party, hostPlayerId);
    if (party.status !== 'LOBBY') {
      console.log(`[#startPhase1WithParty] ERROR: Party ${party.code} status is ${party.status}, not LOBBY`);
      throw conflict('party not in lobby');
    }

    for (const group of party.groups) {
      const players = party.players.filter((p) => p.groupId === group.id);
      if (players.length < 2) {
        console.log(`[#startPhase1WithParty] ERROR: Group ${group.idx} has only ${players.length} players`);
        throw conflict(`group ${group.idx} needs at least 2 players`);
      }
    }

    const startedAtMs = Date.now();
    party.status = 'RUNNING_PHASE1_PREP';
    party.phase1.startedAt = null;
    party.phase1.deadlineAt = null;
    party.phase1.completedAt = null;
    party.phase1.completionReason = null;
    party.phase1Prep.startedAt = isoFromMs(startedAtMs);
    party.phase1Prep.deadlineAt = isoFromMs(startedAtMs + party.statementTimeLimitSec * 1000);
    party.phase1Prep.completedAt = null;
    party.phase1Prep.completionReason = null;
    // Keep statements submitted in lobby, but drop any stale player ids.
    const currentPlayerIds = new Set(party.players.map((p) => p.id));
    const submittedPlayerIds = [...party.phase1Prep.statementsByPlayerId.keys()];
    console.log(`[#startPhase1WithParty] Current player IDs:`, Array.from(currentPlayerIds));
    console.log(`[#startPhase1WithParty] Submitted player IDs:`, submittedPlayerIds);
    party.phase1Prep.statementsByPlayerId = new Map(
      [...party.phase1Prep.statementsByPlayerId.entries()].filter(([pid]) => currentPlayerIds.has(pid))
    );

    console.log(`[#startPhase1WithParty] After filtering: ${party.phase1Prep.statementsByPlayerId.size} statements for ${party.players.length} players`);

    for (const group of party.groups) {
      group.status = 'WAITING';
      party.roundsByGroup.set(group.id, { rounds: [], currentRoundIndex: 0 });
    }

    if (party.phase1Prep.statementsByPlayerId.size >= party.players.length) {
      console.log(`[#startPhase1WithParty] All players submitted, finalizing prep immediately`);
      await this.#finalizePhase1Prep(party, 'all_submitted');
    }

    await this.storage.setParty(party.id, party);
    console.log(`[#startPhase1WithParty] Party ${party.code} saved with status ${party.status}`);
    return this.#snapshot(party);
  }

  async submitPhase1Statements(codeValue, playerId, items) {
    const party = await this.getPartyByCode(codeValue);
    if (!party) throw badRequest('party not found');
    if (party.status !== 'RUNNING_PHASE1_PREP' && party.status !== 'LOBBY') {
      throw conflict('phase 1 statements can only be submitted in lobby or preparation');
    }
    this.#assertPartyMember(party, playerId);

    const cleaned = this.#validateStatements(items);
    party.phase1Prep.statementsByPlayerId.set(playerId, cleaned);

    console.log(`[submitPhase1Statements] Party ${codeValue} status: ${party.status}, players: ${party.players.length}, submitted: ${party.phase1Prep.statementsByPlayerId.size}`);

    if (party.status === 'LOBBY') {
      if (party.players.length >= 2 && party.phase1Prep.statementsByPlayerId.size >= party.players.length) {
        console.log(`[submitPhase1Statements] Auto-starting game for party ${codeValue}`);
        // Don't call startPhase1 which would re-fetch the party from Redis
        // Instead, transition the party directly here
        return await this.#startPhase1WithParty(party, playerId);
      }
      console.log(`[submitPhase1Statements] Not auto-starting: players=${party.players.length}, submitted=${party.phase1Prep.statementsByPlayerId.size}`);
      await this.storage.setParty(party.id, party);
      return this.#snapshot(party);
    }

    if (party.status === 'RUNNING_PHASE1_PREP' && party.phase1Prep.statementsByPlayerId.size >= party.players.length) {
      console.log(`[submitPhase1Statements] Finalizing phase1 prep for party ${codeValue}`);
      await this.#finalizePhase1Prep(party, 'all_submitted');
    }

    await this.storage.setParty(party.id, party);
    return this.#snapshot(party);
  }

  submitStatements(roundId, narratorId, items) {
    const round = this.rounds.get(roundId);
    if (!round) throw badRequest('round not found');
    if (round.narratorId !== narratorId) throw forbidden('only narrator can submit statements');
    if (round.phase !== 1 && round.phase !== 2) throw conflict('invalid phase');
    if (round.phase === 1) {
      throw conflict('phase 1 statements are now collected at game start');
    }
    if (round.status !== 'QUESTIONING') throw conflict('round not in questioning state');

    const cleaned = this.#validateStatements(items);

    const shuffled = cleaned
      .map((item, idx) => ({ id: randomUUID(), ...item, displayOrder: idx + 1 }));

    round.statements = shuffled;
    for (const s of shuffled) this.statements.set(s.id, s);
    round.status = 'VOTING';
    return { roundId: round.id, status: round.status, statements: shuffled };
  }

  async vote(roundId, playerId, statementId) {
    console.log(`[vote] Called for round ${roundId}, player ${playerId}, statement ${statementId}`);
    const round = await this.storage.getRound(roundId);
    if (!round) {
      console.log(`[vote] ERROR: Round ${roundId} not found in storage`);
      throw badRequest('round not found');
    }
    console.log(`[vote] Round ${roundId} status: ${round.status}, votes: ${round.votes?.size || 0}`);
    if (round.status !== 'VOTING') throw conflict('round not in voting state');

    const party = await this.storage.getPartyById(round.partyId);
    const player = await this.storage.getPlayer(playerId);
    if (!party || !player) throw badRequest('party/player not found');

    if (!this.#isEligibleVoter(party, round, player)) {
      throw forbidden('player is not eligible to vote on this round');
    }

    if (round.votes.has(playerId)) {
      throw conflict('already voted');
    }

    const statement = round.statements.find((s) => s.id === statementId);
    if (!statement) throw badRequest('statement not found');

    const voteId = randomUUID();
    const vote = {
      id: voteId,
      roundId,
      playerId,
      statementId,
      isCorrect: statement.isLie,
      rankCorrect: null,
      points: 0,
      createdAt: nowIso(),
    };

    round.votes.set(playerId, vote);
    this.votes.set(voteId, vote);
    await this.storage.setRound(roundId, round);
    await this.storage.setVote(voteId, vote);

    const eligibleVoters = this.#eligibleVoters(party, round);
    const required = eligibleVoters.length;
    console.log(`[vote] Eligible voters: ${required}, current votes: ${round.votes.size}`);
    console.log(`[vote] Eligible voter IDs:`, eligibleVoters.map(v => v.id));
    console.log(`[vote] Narrator ID: ${round.narratorId}`);
    if (round.votes.size >= required) {
      console.log(`[vote] All votes received, closing round`);
      await this.#closeRound(party, round);
    }

    return { accepted: true, roundStatus: round.status };
  }

  closeRound(roundId, requesterPlayerId) {
    const round = this.rounds.get(roundId);
    if (!round) throw badRequest('round not found');

    const party = this.partiesById.get(round.partyId);
    if (!party) throw badRequest('party not found');
    this.#assertPartyMember(party, requesterPlayerId);
    if (round.status !== 'VOTING' && round.status !== 'QUESTIONING') {
      throw conflict('round cannot be closed in current state');
    }

    this.#closeRound(party, round);
    return this.#snapshot(party);
  }

  startPhase2(codeValue, hostPlayerId) {
    const party = this.getPartyByCode(codeValue);
    if (!party) throw badRequest('party not found');
    this.#assertPartyMember(party, hostPlayerId);

    if (party.groups.length < 2) {
      throw conflict('phase 2 requires at least 2 groups');
    }

    if (party.status !== 'RUNNING_PHASE1') {
      throw conflict('phase 2 can only start after phase 1');
    }

    if (!party.phase1.completedAt) {
      throw conflict('phase 1 is not completed yet');
    }

    const phase2Narrators = [];
    for (const group of party.groups) {
      const players = party.players.filter((p) => p.groupId === group.id);
      let minLeak = Number.POSITIVE_INFINITY;
      for (const player of players) {
        const leak = party.leakScores.get(player.id) ?? 0;
        if (leak < minLeak) minLeak = leak;
      }
      for (const player of players) {
        const leak = party.leakScores.get(player.id) ?? 0;
        if (leak === minLeak) phase2Narrators.push(player.id);
      }
    }

    if (phase2Narrators.length === 0) {
      throw conflict('no phase 2 narrators available');
    }

    const startedAtMs = Date.now();
    party.status = 'RUNNING_PHASE2';
    party.phase2.startedAt = isoFromMs(startedAtMs);
    party.phase2.deadlineAt = isoFromMs(startedAtMs + party.phaseTimeLimitSec * 1000);
    party.phase2.completedAt = null;
    party.phase2.completionReason = null;

    party.phase2Rounds = phase2Narrators.map((narratorId, idx) => {
      const roundId = randomUUID();
      const round = {
        id: roundId,
        partyId: party.id,
        groupId: null,
        phase: 2,
        idx: idx + 1,
        narratorId,
        status: idx === 0 ? 'QUESTIONING' : 'DRAFT',
        statements: [],
        votes: [],
        revealedLieStatementId: null,
        startedAt: idx === 0 ? nowIso() : null,
        endedAt: null,
      };
      this.rounds.set(roundId, round);
      return round;
    });
    party.currentPhase2RoundIndex = 0;

    return this.#snapshot(party);
  }

  #forceFinishPhase1ByTimeout(party) {
    if (party.status === 'RUNNING_PHASE1_PREP') {
      this.#finalizePhase1Prep(party, 'time_limit');
    }
    this.#markPhase1Complete(party, 'time_limit');

    for (const group of party.groups) {
      const state = party.roundsByGroup.get(group.id);
      if (!state) continue;

      for (; ;) {
        const current = state.rounds[state.currentRoundIndex];
        if (!current) break;
        if (current.status === 'QUESTIONING' || current.status === 'VOTING') {
          this.#closeRound(party, current);
          continue;
        }
        break;
      }

      for (const round of state.rounds) {
        if (round.status === 'DRAFT') {
          round.status = 'CLOSED';
          round.endedAt = nowIso();
          party.leakScores.set(round.narratorId, 0);
        }
      }

      state.currentRoundIndex = state.rounds.length;
      group.status = 'DONE';
    }
  }

  #forceFinishPhase2ByTimeout(party) {
    this.#markPhase2Complete(party, 'time_limit');

    for (const round of party.phase2Rounds) {
      if (round.status === 'QUESTIONING' || round.status === 'VOTING') {
        this.#closeRound(party, round);
      } else if (round.status === 'DRAFT') {
        round.status = 'CLOSED';
        round.endedAt = nowIso();
      }
    }

    party.currentPhase2RoundIndex = party.phase2Rounds.length;
  }

  async #closeRound(party, round) {
    if (round.status === 'CLOSED') return;

    round.status = 'REVEAL';
    const lieStatement = round.statements.find((s) => s.isLie);
    if (lieStatement) {
      round.revealedLieStatementId = lieStatement.id;
    }

    // Convert votes Map to array for processing
    const votesArray = Array.from(round.votes.values());
    const correct = votesArray
      .filter((v) => v.isCorrect)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));

    const voterCount = this.#eligibleVoters(party, round).length;
    for (let i = 0; i < correct.length; i += 1) {
      const vote = correct[i];
      vote.rankCorrect = i + 1;
      const base = voterCount - i;
      const multiplier = round.phase === 2 ? party.phase2Multiplier : 1;
      vote.points = Math.max(base, 1) * multiplier;
      // Update vote in Map
      round.votes.set(vote.playerId, vote);
      await this.storage.setVote(vote.id, vote);
    }

    const roundStartedMs = round.startedAt ? new Date(round.startedAt).getTime() : null;

    for (const vote of votesArray) {
      const score = party.scores.get(vote.playerId);
      if (!score) continue;
      if (round.phase === 1) score.phase1 += vote.points;
      if (round.phase === 2) score.phase2 += vote.points;
      score.total = score.phase1 + score.phase2;
      party.scores.set(vote.playerId, score);

      vote.timeToVoteMs = roundStartedMs ? Math.max(0, new Date(vote.createdAt).getTime() - roundStartedMs) : null;
      round.votes.set(vote.playerId, vote);
      await this.storage.setVote(vote.id, vote);
    }

    party.roundHistory.push({
      roundId: round.id,
      phase: round.phase,
      idx: round.idx,
      groupId: round.groupId,
      narratorId: round.narratorId,
      startedAt: round.startedAt,
      endedAt: nowIso(),
      revealedLieStatementId: round.revealedLieStatementId,
      lieText: round.statements.find((s) => s.id === round.revealedLieStatementId)?.text ?? null,
      votes: votesArray.map((v) => ({
        playerId: v.playerId,
        isCorrect: v.isCorrect,
        points: v.points,
        rankCorrect: v.rankCorrect,
        timeToVoteMs: v.timeToVoteMs ?? null,
        statementId: v.statementId,
        pickedText: round.statements.find((s) => s.id === v.statementId)?.text ?? null,
      })),
    });

    if (round.phase === 1) {
      const leak = votesArray.reduce((acc, v) => acc + v.points, 0);
      party.leakScores.set(round.narratorId, leak);

      const voters = this.#eligibleVoters(party, round);
      for (const player of voters) {
        party.seenNarrators.get(player.id)?.add(round.narratorId);
      }

      await this.#advancePhase1GroupRound(party, round.groupId);
    } else {
      await this.#advancePhase2Round(party);
    }

    round.status = 'CLOSED';
    round.endedAt = nowIso();

    // Save round and party to storage
    await this.storage.setRound(round.id, round);
    await this.storage.setParty(party.id, party);
  }

  async #advancePhase1GroupRound(party, groupId) {
    const state = party.roundsByGroup.get(groupId);
    if (!state) return;
    const nextIndex = state.currentRoundIndex + 1;
    if (nextIndex >= state.rounds.length) {
      state.currentRoundIndex = state.rounds.length;
      const group = party.groups.find((g) => g.id === groupId);
      if (group) group.status = 'DONE';
      this.#finalizePhase1IfComplete(party);
      return;
    }

    state.currentRoundIndex = nextIndex;
    const nextRound = state.rounds[nextIndex];
    nextRound.status = 'VOTING';
    nextRound.startedAt = nowIso();
    console.log(`[#advancePhase1GroupRound] Advancing to round ${nextRound.id}, setting status to VOTING`);
    // Save the updated round to storage
    await this.storage.setRound(nextRound.id, nextRound);
  }

  async #advancePhase2Round(party) {
    const nextIndex = party.currentPhase2RoundIndex + 1;
    if (nextIndex >= party.phase2Rounds.length) {
      party.currentPhase2RoundIndex = party.phase2Rounds.length;
      await this.#markPhase2Complete(party, 'all_played');
      return;
    }
    party.currentPhase2RoundIndex = nextIndex;
    const nextRound = party.phase2Rounds[nextIndex];
    nextRound.status = 'QUESTIONING';
    nextRound.startedAt = nowIso();
    console.log(`[#advancePhase2Round] Advancing to round ${nextRound.id}, setting status to QUESTIONING`);
    // Save the updated round to storage
    await this.storage.setRound(nextRound.id, nextRound);
  }

  #finalizePhase1IfComplete(party) {
    if (party.phase1.completedAt) return;
    if (party.groups.every((g) => g.status === 'DONE')) {
      this.#markPhase1Complete(party, 'all_played');
    }
  }

  #markPhase1Complete(party, reason) {
    if (party.phase1.completedAt) return;
    party.phase1.completedAt = nowIso();
    party.phase1.completionReason = reason;
  }

  #markPhase2Complete(party, reason) {
    if (party.phase2.completedAt) return;
    party.phase2.completedAt = nowIso();
    party.phase2.completionReason = reason;
    party.status = 'FINISHED';
  }

  #nextGroupForJoin(party) {
    const counts = new Map(party.groups.map((g) => [g.id, 0]));
    for (const p of party.players) counts.set(p.groupId, (counts.get(p.groupId) || 0) + 1);

    let winner = party.groups[0];
    for (const g of party.groups) {
      const cg = counts.get(g.id) || 0;
      const cw = counts.get(winner.id) || 0;
      if (cg < cw) winner = g;
    }
    return winner;
  }

  #createGroup(party) {
    const maxIdx = party.groups.reduce((m, g) => Math.max(m, g.idx), 0);
    const group = { id: randomUUID(), idx: maxIdx + 1, status: 'WAITING' };
    party.groups.push(group);
    return group;
  }

  #assertPartyMember(party, playerId) {
    if (!playerId || !party.players.some((p) => p.id === playerId)) {
      throw forbidden('party member only');
    }
  }

  #validateStatements(items) {
    if (!Array.isArray(items) || items.length !== 3) {
      throw badRequest('exactly 3 statements required');
    }

    const lieCount = items.filter((x) => x && x.isLie === true).length;
    if (lieCount !== 1) throw badRequest('exactly 1 lie required');

    return items.map((x) => {
      const text = (x?.text || '').trim();
      if (!text || text.length > 180) {
        throw badRequest('statement text must be 1-180 chars');
      }
      return { text, isLie: !!x.isLie };
    });
  }

  async #finalizePhase1Prep(party, reason) {
    console.log(`[#finalizePhase1Prep] Called for party ${party.code}, reason: ${reason}`);
    if (party.phase1Prep.completedAt) {
      console.log(`[#finalizePhase1Prep] Already completed, skipping`);
      return;
    }
    party.phase1Prep.completedAt = nowIso();
    party.phase1Prep.completionReason = reason;

    const startedAtMs = Date.now();
    party.status = 'RUNNING_PHASE1';
    party.phase1.startedAt = isoFromMs(startedAtMs);
    party.phase1.deadlineAt = isoFromMs(startedAtMs + party.phaseTimeLimitSec * 1000);
    console.log(`[#finalizePhase1Prep] Party ${party.code} status changed to RUNNING_PHASE1`);

    for (const group of party.groups) {
      const groupPlayers = party.players.filter((p) => p.groupId === group.id);
      const narrators = groupPlayers.filter((p) => party.phase1Prep.statementsByPlayerId.has(p.id));
      if (narrators.length === 0) {
        group.status = 'DONE';
        party.roundsByGroup.set(group.id, { rounds: [], currentRoundIndex: 0 });
        continue;
      }

      group.status = 'PLAYING';
      const rounds = [];
      for (let idx = 0; idx < narrators.length; idx++) {
        const narrator = narrators[idx];
        const roundId = randomUUID();
        const cleaned = party.phase1Prep.statementsByPlayerId.get(narrator.id);
        const shuffled = cleaned
          .map((item, sidx) => ({ id: randomUUID(), ...item, displayOrder: sidx + 1 }));
        const round = {
          id: roundId,
          partyId: party.id,
          groupId: group.id,
          phase: 1,
          idx: idx + 1,
          narratorId: narrator.id,
          status: idx === 0 ? 'VOTING' : 'DRAFT',
          statements: shuffled,
          votes: new Map(),
          revealedLieStatementId: null,
          startedAt: idx === 0 ? nowIso() : null,
          endedAt: null,
        };
        // Save statements and round to storage
        for (const s of shuffled) {
          this.statements.set(s.id, s);
          await this.storage.setStatement(s.id, s);
        }
        this.rounds.set(roundId, round);
        await this.storage.setRound(roundId, round);
        rounds.push(round);
      }
      party.roundsByGroup.set(group.id, { rounds, currentRoundIndex: 0 });
    }

    this.#finalizePhase1IfComplete(party);
  }

  #eligibleVoters(party, round) {
    if (round.phase === 1) {
      return party.players.filter((p) => p.groupId === round.groupId && p.id !== round.narratorId);
    }

    return party.players.filter((p) => {
      if (p.id === round.narratorId) return false;
      const seen = party.seenNarrators.get(p.id);
      return !seen?.has(round.narratorId);
    });
  }

  #isEligibleVoter(party, round, player) {
    return this.#eligibleVoters(party, round).some((p) => p.id === player.id);
  }

  #phase1Results(party) {
    if (!party.phase1.completedAt) return null;

    const groups = party.groups.map((group) => {
      const players = party.players.filter((p) => p.groupId === group.id);
      const scoreboard = players.map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        phase1: party.scores.get(p.id)?.phase1 ?? 0,
        leakScore: party.leakScores.get(p.id) ?? 0,
      }));

      const maxPhase1 = Math.max(...scoreboard.map((x) => x.phase1));
      const minLeak = Math.min(...scoreboard.map((x) => x.leakScore));

      return {
        groupId: group.id,
        groupIndex: group.idx,
        winners: scoreboard
          .filter((x) => x.phase1 === maxPhase1)
          .map((x) => ({
            ...x,
            bestFindTimeSec: this.#bestCorrectTimeSecForPlayer(party, 1, x.playerId),
          })),
        bestLiars: scoreboard.filter((x) => x.leakScore === minLeak),
      };
    });

    return {
      completedAt: party.phase1.completedAt,
      completionReason: party.phase1.completionReason,
      groups,
      mistakenPlayers: this.#mistakenPlayersForPhase(party, 1),
    };
  }

  #phase2Results(party, leaderboard) {
    if (!party.phase2.completedAt) return null;
    const maxTotal = Math.max(...leaderboard.map((x) => x.total));
    return {
      completedAt: party.phase2.completedAt,
      completionReason: party.phase2.completionReason,
      finalWinners: leaderboard
        .filter((x) => x.total === maxTotal)
        .map((x) => ({
          ...x,
          bestFindTimeSec: this.#bestCorrectTimeSecForPlayer(party, 2, x.playerId),
        })),
      mistakenPlayers: this.#mistakenPlayersForPhase(party, 2),
    };
  }

  #bestCorrectTimeSecForPlayer(party, phase, playerId) {
    const times = party.roundHistory
      .filter((r) => r.phase === phase)
      .flatMap((r) => r.votes)
      .filter((v) => v.playerId === playerId && v.isCorrect && typeof v.timeToVoteMs === 'number')
      .map((v) => v.timeToVoteMs);

    if (times.length === 0) return null;
    return Number((Math.min(...times) / 1000).toFixed(2));
  }

  #mistakenPlayersForPhase(party, phase) {
    const counts = new Map();
    for (const round of party.roundHistory) {
      if (round.phase !== phase) continue;
      for (const vote of round.votes) {
        if (vote.isCorrect) continue;
        counts.set(vote.playerId, (counts.get(vote.playerId) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([playerId, wrongCount]) => {
        const player = party.players.find((p) => p.id === playerId);
        return {
          playerId,
          nickname: player?.nickname ?? playerId,
          wrongCount,
        };
      })
      .sort((a, b) => b.wrongCount - a.wrongCount || a.nickname.localeCompare(b.nickname));
  }

  #snapshot(party) {
    const phase1Groups = party.groups.map((group) => {
      const state = party.roundsByGroup.get(group.id);
      const current = state?.rounds[state.currentRoundIndex] ?? null;
      return {
        ...group,
        players: party.players.filter((p) => p.groupId === group.id).map((p) => ({
          id: p.id,
          nickname: p.nickname,
          isHost: p.isHost,
        })),
        currentRound: current ? this.#publicRound(current) : null,
      };
    });

    const phase2Current = party.phase2Rounds[party.currentPhase2RoundIndex] || null;
    const partyPlayerIds = new Set(party.players.map((p) => p.id));
    const submittedPlayerIds = [...party.phase1Prep.statementsByPlayerId.keys()].filter((id) => partyPlayerIds.has(id));
    const submittedPlayers = submittedPlayerIds.map((id) => ({
      playerId: id,
      nickname: party.players.find((p) => p.id === id)?.nickname ?? id,
    }));

    const leaderboard = party.players
      .map((p) => {
        const s = party.scores.get(p.id) || { phase1: 0, phase2: 0, total: 0 };
        return {
          playerId: p.id,
          nickname: p.nickname,
          groupId: p.groupId,
          phase1: s.phase1,
          phase2: s.phase2,
          total: s.total,
          leakScore: party.leakScores.get(p.id) ?? null,
        };
      })
      .sort((a, b) => b.total - a.total || a.nickname.localeCompare(b.nickname));

    const lastRound = party.roundHistory[party.roundHistory.length - 1] ?? null;
    const lastReveal = lastRound
      ? {
        roundId: lastRound.roundId,
        phase: lastRound.phase,
        idx: lastRound.idx,
        groupId: lastRound.groupId,
        narratorId: lastRound.narratorId,
        narratorNickname: party.players.find((p) => p.id === lastRound.narratorId)?.nickname ?? lastRound.narratorId,
        lieText: lastRound.lieText,
        endedAt: lastRound.endedAt,
        votes: lastRound.votes.map((v) => ({
          playerId: v.playerId,
          nickname: party.players.find((p) => p.id === v.playerId)?.nickname ?? v.playerId,
          isCorrect: v.isCorrect,
          points: v.points,
          rankCorrect: v.rankCorrect,
          timeToVoteMs: v.timeToVoteMs,
          pickedText: v.pickedText,
        })),
      }
      : null;

    return {
      id: party.id,
      code: party.code,
      status: party.status,
      roundTimerSec: party.roundTimerSec,
      phaseTimeLimitSec: party.phaseTimeLimitSec,
      phase2Multiplier: party.phase2Multiplier,
      hostPlayerId: party.hostPlayerId,
      phaseTiming: {
        phase1: party.phase1,
        phase2: party.phase2,
        phase1Prep: {
          startedAt: party.phase1Prep.startedAt,
          deadlineAt: party.phase1Prep.deadlineAt,
          completedAt: party.phase1Prep.completedAt,
          completionReason: party.phase1Prep.completionReason,
          submittedCount: submittedPlayerIds.length,
          totalPlayers: party.players.length,
          submittedPlayers,
        },
      },
      phaseResults: {
        phase1: this.#phase1Results(party),
        phase2: this.#phase2Results(party, leaderboard),
      },
      phase2Eligibility: {
        allowed: party.groups.length >= 2,
        reason: party.groups.length >= 2 ? null : 'single_group_no_phase2',
      },
      lastReveal,
      groups: phase1Groups,
      players: party.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        groupId: p.groupId,
        isHost: p.isHost,
      })),
      phase2CurrentRound: phase2Current ? this.#publicRound(phase2Current) : null,
      leaderboard,
    };
  }

  #publicRound(round) {
    // Handle both Map (phase1) and Array (phase2) votes
    const voterIds = round.votes instanceof Map
      ? Array.from(round.votes.keys())
      : Array.isArray(round.votes)
        ? round.votes.map((v) => v.playerId)
        : [];

    return {
      id: round.id,
      phase: round.phase,
      idx: round.idx,
      groupId: round.groupId,
      narratorId: round.narratorId,
      status: round.status,
      statements: round.status === 'QUESTIONING' ? [] : round.statements,
      revealedLieStatementId: round.status === 'CLOSED' ? round.revealedLieStatementId : null,
      votesCount: voterIds.length,
      voterIds,
      startedAt: round.startedAt,
      endedAt: round.endedAt,
    };
  }
}
