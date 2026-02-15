import { getRedis, isRedisAvailable } from './redis.mjs';

/**
 * Couche d'abstraction pour le stockage
 * Utilise Redis si disponible, sinon fallback en mémoire
 */
export class Storage {
  constructor() {
    this.redis = getRedis();
    this.useRedis = isRedisAvailable();
    
    // Fallback en mémoire si Redis n'est pas disponible
    if (!this.useRedis) {
      this.memory = {
        partiesById: new Map(),
        partiesByCode: new Map(),
        players: new Map(),
        rounds: new Map(),
        statements: new Map(),
        votes: new Map(),
      };
    }
    
    console.log(this.useRedis ? '✅ Using Redis storage' : '⚠️  Using in-memory storage');
  }

  // ========== PARTIES ==========
  
  async setParty(partyId, party) {
    if (this.useRedis) {
      // Sérialiser les Maps en objets pour Redis
      const serialized = this._serializeParty(party);
      // Upstash Redis auto-parse JSON, donc on stringify
      await this.redis.set(`party:${partyId}`, JSON.stringify(serialized), { ex: 86400 }); // 24h TTL
      await this.redis.set(`party:code:${party.code}`, partyId, { ex: 86400 });
    } else {
      this.memory.partiesById.set(partyId, party);
      this.memory.partiesByCode.set(party.code, partyId);
    }
  }

  async getPartyById(partyId) {
    if (this.useRedis) {
      const data = await this.redis.get(`party:${partyId}`);
      if (!data) return null;
      // Upstash auto-parse JSON, donc data est déjà un objet
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return this._deserializeParty(parsed);
    } else {
      return this.memory.partiesById.get(partyId) ?? null;
    }
  }

  async getPartyByCode(code) {
    if (this.useRedis) {
      const partyId = await this.redis.get(`party:code:${code.toUpperCase()}`);
      if (!partyId) return null;
      return await this.getPartyById(partyId);
    } else {
      const partyId = this.memory.partiesByCode.get(code.toUpperCase());
      if (!partyId) return null;
      return this.memory.partiesById.get(partyId) ?? null;
    }
  }

  async partyCodeExists(code) {
    if (this.useRedis) {
      const exists = await this.redis.exists(`party:code:${code.toUpperCase()}`);
      return exists === 1;
    } else {
      return this.memory.partiesByCode.has(code.toUpperCase());
    }
  }

  // ========== PLAYERS ==========
  
  async setPlayer(playerId, player) {
    if (this.useRedis) {
      await this.redis.set(`player:${playerId}`, JSON.stringify(player), { ex: 86400 });
    } else {
      this.memory.players.set(playerId, player);
    }
  }

  async getPlayer(playerId) {
    if (this.useRedis) {
      const data = await this.redis.get(`player:${playerId}`);
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) : data;
    } else {
      return this.memory.players.get(playerId) ?? null;
    }
  }

  async deletePlayer(playerId) {
    if (this.useRedis) {
      await this.redis.del(`player:${playerId}`);
    } else {
      this.memory.players.delete(playerId);
    }
  }

  // ========== ROUNDS ==========
  
  async setRound(roundId, round) {
    if (this.useRedis) {
      const serialized = this._serializeRound(round);
      await this.redis.set(`round:${roundId}`, JSON.stringify(serialized), { ex: 86400 });
    } else {
      this.memory.rounds.set(roundId, round);
    }
  }

  async getRound(roundId) {
    if (this.useRedis) {
      const data = await this.redis.get(`round:${roundId}`);
      if (!data) return null;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return this._deserializeRound(parsed);
    } else {
      return this.memory.rounds.get(roundId) ?? null;
    }
  }

  // ========== STATEMENTS ==========
  
  async setStatement(statementId, statement) {
    if (this.useRedis) {
      await this.redis.set(`statement:${statementId}`, JSON.stringify(statement), { ex: 86400 });
    } else {
      this.memory.statements.set(statementId, statement);
    }
  }

  async getStatement(statementId) {
    if (this.useRedis) {
      const data = await this.redis.get(`statement:${statementId}`);
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) : data;
    } else {
      return this.memory.statements.get(statementId) ?? null;
    }
  }

  // ========== VOTES ==========

  async setVote(voteId, vote) {
    if (this.useRedis) {
      await this.redis.set(`vote:${voteId}`, JSON.stringify(vote), { ex: 86400 });
    } else {
      this.memory.votes.set(voteId, vote);
    }
  }

  async getVote(voteId) {
    if (this.useRedis) {
      const data = await this.redis.get(`vote:${voteId}`);
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) : data;
    } else {
      return this.memory.votes.get(voteId) ?? null;
    }
  }

  // ========== SERIALIZATION HELPERS ==========
  
  _serializeParty(party) {
    return {
      ...party,
      roundsByGroup: Array.from(party.roundsByGroup.entries()),
      scores: Array.from(party.scores.entries()),
      leakScores: Array.from(party.leakScores.entries()),
      seenNarrators: Array.from(party.seenNarrators.entries()).map(([key, set]) => [key, Array.from(set)]),
      phase1Prep: {
        ...party.phase1Prep,
        statementsByPlayerId: Array.from(party.phase1Prep.statementsByPlayerId.entries()),
      },
    };
  }

  _deserializeParty(data) {
    return {
      ...data,
      roundsByGroup: new Map(data.roundsByGroup),
      scores: new Map(data.scores),
      leakScores: new Map(data.leakScores),
      seenNarrators: new Map(data.seenNarrators.map(([key, arr]) => [key, new Set(arr)])),
      phase1Prep: {
        ...data.phase1Prep,
        statementsByPlayerId: new Map(data.phase1Prep.statementsByPlayerId),
      },
    };
  }

  _serializeRound(round) {
    return {
      ...round,
      votes: Array.from(round.votes.entries()),
    };
  }

  _deserializeRound(data) {
    return {
      ...data,
      votes: new Map(data.votes),
    };
  }
}

