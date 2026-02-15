import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../src/game.mjs';

function createPartyWithPlayers(store, groups = 1, players = [], phaseTimeLimitSec = 600) {
  const party = store.createParty({ groups, roundTimerSec: 120, phaseTimeLimitSec });
  const joined = players.map((name) => store.joinParty(party.code, name));
  return { party, joined };
}

function submitDefaultStatements(store, roundId, narratorId) {
  const result = store.submitStatements(roundId, narratorId, [
    { text: 'Vrai 1', isLie: false },
    { text: 'Vrai 2', isLie: false },
    { text: 'Mensonge', isLie: true },
  ]);
  return result.statements.find((s) => s.isLie)?.id;
}

function submitDefaultPrep(store, code, playerId) {
  return store.submitPhase1Statements(code, playerId, [
    { text: `Vrai A ${playerId.slice(0, 4)}`, isLie: false },
    { text: `Vrai B ${playerId.slice(0, 4)}`, isLie: false },
    { text: `Mensonge ${playerId.slice(0, 4)}`, isLie: true },
  ]);
}

function completePrepForAll(store, code, joined) {
  let snap = null;
  for (const j of joined) {
    snap = submitDefaultPrep(store, code, j.playerId);
  }
  return snap;
}

test('phase 1 scoring ranks correct votes by speed', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B', 'C', 'D']);
  store.startPhase1(party.code, joined[0].playerId);
  completePrepForAll(store, party.code, joined);

  const snap = store.getPartySnapshot(party.code);
  const round = snap.groups[0].currentRound;
  const lieId = store.rounds.get(round.id).statements.find((s) => s.isLie).id;

  const voters = joined.map((j) => j.playerId).filter((id) => id !== round.narratorId);
  store.vote(round.id, voters[0], lieId);
  store.vote(round.id, voters[1], lieId);

  const anyOther = store.rounds.get(round.id).statements.find((s) => s.id !== lieId).id;
  store.vote(round.id, voters[2], anyOther);

  const after = store.getPartySnapshot(party.code);
  const lb = after.leaderboard;
  const s1 = lb.find((x) => x.playerId === voters[0]);
  const s2 = lb.find((x) => x.playerId === voters[1]);
  const s3 = lb.find((x) => x.playerId === voters[2]);

  assert.equal(s1.phase1, 3);
  assert.equal(s2.phase1, 2);
  assert.equal(s3.phase1, 0);
});

test('best liar is narrator with minimum leak score', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B', 'C']);
  store.startPhase1(party.code, joined[0].playerId);
  completePrepForAll(store, party.code, joined);

  for (let i = 0; i < 3; i += 1) {
    const snap = store.getPartySnapshot(party.code);
    const round = snap.groups[0].currentRound;
    const lieId = store.rounds.get(round.id).statements.find((s) => s.isLie).id;
    const voters = joined.map((j) => j.playerId).filter((id) => id !== round.narratorId);

    if (i === 0) {
      // leak 0 (everyone wrong)
      const wrong = store.rounds.get(round.id).statements.find((s) => s.id !== lieId).id;
      store.vote(round.id, voters[0], wrong);
      store.vote(round.id, voters[1], wrong);
    } else {
      // leak > 0
      store.vote(round.id, voters[0], lieId);
      store.vote(round.id, voters[1], lieId);
    }
  }

  const realParty = store.getPartyByCode(party.code);
  const groupPlayers = realParty.players.filter((p) => p.groupId === realParty.groups[0].id);
  const leaks = groupPlayers.map((p) => ({ id: p.id, leak: realParty.leakScores.get(p.id) ?? 0 }));
  leaks.sort((a, b) => a.leak - b.leak);

  assert.equal(leaks[0].leak, 0);
});

test('phase 2 multiplier applies and final status is FINISHED', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 2, ['A', 'B', 'C', 'D', 'E', 'F']);
  store.startPhase1(party.code, joined[0].playerId);
  completePrepForAll(store, party.code, joined);

  for (;;) {
    const snap = store.getPartySnapshot(party.code);
    const openGroups = snap.groups.filter((g) => g.currentRound && (g.currentRound.status === 'QUESTIONING' || g.currentRound.status === 'VOTING'));
    if (openGroups.length === 0) break;

    for (const g of openGroups) {
      const r = g.currentRound;
      const lieId = store.rounds.get(r.id).statements.find((s) => s.isLie).id;
      const voters = joined.map((j) => j.playerId).filter((id) => {
        const p = store.players.get(id);
        return p.groupId === g.id && id !== r.narratorId;
      });
      for (const v of voters) store.vote(r.id, v, lieId);
    }
  }

  store.startPhase2(party.code, joined[0].playerId);

  for (;;) {
    const snap = store.getPartySnapshot(party.code);
    const r = snap.phase2CurrentRound;
    if (!r) break;
    const lieId = submitDefaultStatements(store, r.id, r.narratorId);
    const voters = joined.map((j) => j.playerId).filter((id) => {
      if (id === r.narratorId) return false;
      const partyObj = store.getPartyByCode(party.code);
      return !partyObj.seenNarrators.get(id)?.has(r.narratorId);
    });
    for (const v of voters) store.vote(r.id, v, lieId);
  }

  const end = store.getPartySnapshot(party.code);
  assert.equal(end.status, 'FINISHED');
  assert.ok(end.leaderboard.some((x) => x.phase2 > 0));
  assert.equal(end.phaseResults.phase2.completionReason, 'all_played');
});

test('phase 1 timeout closes phase and exposes phase results', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B', 'C'], 60);
  store.startPhase1(party.code, joined[0].playerId);
  completePrepForAll(store, party.code, joined);

  const internal = store.getPartyByCode(party.code);
  internal.phase1.deadlineAt = new Date(Date.now() - 1000).toISOString();
  const changed = store.enforceDeadlines();

  assert.equal(changed.length, 1);
  const snap = store.getPartySnapshot(party.code);
  assert.ok(snap.phaseResults.phase1);
  assert.equal(snap.phaseResults.phase1.completionReason, 'time_limit');
});

test('phase results include winner timing and mistaken players', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B', 'C'], 600);
  store.startPhase1(party.code, joined[0].playerId);
  completePrepForAll(store, party.code, joined);

  const snap = store.getPartySnapshot(party.code);
  const round = snap.groups[0].currentRound;
  const lieId = store.rounds.get(round.id).statements.find((s) => s.isLie).id;

  const voters = joined.map((j) => j.playerId).filter((id) => id !== round.narratorId);
  const wrong = store.rounds.get(round.id).statements.find((s) => s.id !== lieId).id;
  store.vote(round.id, voters[0], lieId);
  store.vote(round.id, voters[1], wrong);

  const internal = store.getPartyByCode(party.code);
  internal.phase1.deadlineAt = new Date(Date.now() - 1000).toISOString();
  store.enforceDeadlines();

  const end = store.getPartySnapshot(party.code);
  const p1 = end.phaseResults.phase1;
  assert.ok(p1);

  const mistaken = p1.mistakenPlayers.find((x) => x.playerId === voters[1]);
  assert.ok(mistaken);
  assert.equal(mistaken.wrongCount, 1);

  const winners = p1.groups[0].winners;
  assert.ok(winners.length >= 1);
  assert.ok('phase1' in winners[0]);
  assert.ok('bestFindTimeSec' in winners[0]);
});

test('player can be removed in lobby and host is reassigned', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['Host', 'B', 'C'], 600);

  const hostId = joined[0].playerId;
  const nextId = joined[1].playerId;
  const snap1 = store.getPartySnapshot(party.code);
  assert.equal(snap1.hostPlayerId, hostId);

  const snap2 = store.removePlayer(party.code, hostId);
  assert.equal(snap2.hostPlayerId, nextId);
  assert.equal(snap2.groups[0].players.length, 2);
});

test('phase 1 can start with 2 players in a group', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B'], 600);
  const snap = store.startPhase1(party.code, joined[0].playerId);
  assert.equal(snap.status, 'RUNNING_PHASE1_PREP');
  const afterPrep = completePrepForAll(store, party.code, joined);
  assert.equal(afterPrep.status, 'RUNNING_PHASE1');
  assert.ok(afterPrep.groups[0].currentRound);
});

test('any participant can start phase 1 (not only host)', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['Host', 'B'], 600);
  const snap = store.startPhase1(party.code, joined[1].playerId);
  assert.equal(snap.status, 'RUNNING_PHASE1_PREP');
});

test('snapshot exposes lastReveal after round close', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B'], 600);
  store.startPhase1(party.code, joined[0].playerId);
  completePrepForAll(store, party.code, joined);
  const snap = store.getPartySnapshot(party.code);
  const round = snap.groups[0].currentRound;
  const lieId = store.rounds.get(round.id).statements.find((s) => s.isLie).id;
  const voter = joined.map((j) => j.playerId).find((id) => id !== round.narratorId);
  store.vote(round.id, voter, lieId);
  const end = store.getPartySnapshot(party.code);
  assert.ok(end.lastReveal);
  assert.equal(end.lastReveal.roundId, round.id);
  assert.ok(end.lastReveal.lieText);
});

test('any participant can close current round manually', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B'], 600);
  store.startPhase1(party.code, joined[0].playerId);
  completePrepForAll(store, party.code, joined);
  const snap = store.getPartySnapshot(party.code);
  const round = snap.groups[0].currentRound;
  store.closeRound(round.id, joined[1].playerId);
  const after = store.getPartySnapshot(party.code);
  assert.ok(after.lastReveal);
  assert.equal(after.lastReveal.roundId, round.id);
});

test('phase 1 starts with simultaneous prep and auto-transitions when all submitted', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B', 'C'], 600);
  const prep = store.startPhase1(party.code, joined[0].playerId);
  assert.equal(prep.status, 'RUNNING_PHASE1_PREP');
  assert.equal(prep.phaseTiming.phase1Prep.submittedCount, 0);

  store.submitPhase1Statements(party.code, joined[0].playerId, [
    { text: 'a', isLie: false },
    { text: 'b', isLie: false },
    { text: 'c', isLie: true },
  ]);
  const s2 = store.submitPhase1Statements(party.code, joined[1].playerId, [
    { text: 'd', isLie: false },
    { text: 'e', isLie: false },
    { text: 'f', isLie: true },
  ]);
  assert.equal(s2.status, 'RUNNING_PHASE1_PREP');

  const done = store.submitPhase1Statements(party.code, joined[2].playerId, [
    { text: 'g', isLie: false },
    { text: 'h', isLie: false },
    { text: 'i', isLie: true },
  ]);
  assert.equal(done.status, 'RUNNING_PHASE1');
  assert.ok(done.groups[0].currentRound);
});

test('players can submit statements in lobby before phase 1 starts', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B'], 600);

  store.submitPhase1Statements(party.code, joined[0].playerId, [
    { text: 'a1', isLie: false },
    { text: 'a2', isLie: false },
    { text: 'a3', isLie: true },
  ]);
  const afterSecond = store.submitPhase1Statements(party.code, joined[1].playerId, [
    { text: 'b1', isLie: false },
    { text: 'b2', isLie: false },
    { text: 'b3', isLie: true },
  ]);
  assert.equal(afterSecond.status, 'RUNNING_PHASE1');
  assert.ok(afterSecond.groups[0].currentRound);
});

test('phase 2 is not allowed for single-group parties', () => {
  const store = new GameStore();
  const { party, joined } = createPartyWithPlayers(store, 1, ['A', 'B'], 600);
  const prep = store.submitPhase1Statements(party.code, joined[0].playerId, [
    { text: 'a1', isLie: false },
    { text: 'a2', isLie: false },
    { text: 'a3', isLie: true },
  ]);
  assert.equal(prep.phase2Eligibility.allowed, false);
  store.submitPhase1Statements(party.code, joined[1].playerId, [
    { text: 'b1', isLie: false },
    { text: 'b2', isLie: false },
    { text: 'b3', isLie: true },
  ]);

  let err = null;
  try {
    store.startPhase2(party.code, joined[0].playerId);
  } catch (e) {
    err = e;
  }
  assert.ok(err);
  assert.equal(err.message, 'phase 2 requires at least 2 groups');
});

test('join can target existing group or create a new one', () => {
  const store = new GameStore();
  const party = store.createParty({ groups: 0, roundTimerSec: 120, phaseTimeLimitSec: 600 });

  const a = store.joinParty(party.code, 'A', { createGroup: true });
  const b = store.joinParty(party.code, 'B', { groupIndex: 1 });
  const c = store.joinParty(party.code, 'C', { createGroup: true });

  const snap = store.getPartySnapshot(party.code);
  assert.equal(snap.groups.length, 2);
  const g1 = snap.groups.find((g) => g.idx === 1);
  const g2 = snap.groups.find((g) => g.idx === 2);
  assert.ok(g1);
  assert.ok(g2);
  assert.equal(g1.players.length, 2);
  assert.equal(g2.players.length, 1);
  assert.equal(a.groupId, g1.id);
  assert.equal(b.groupId, g1.id);
  assert.equal(c.groupId, g2.id);
});
