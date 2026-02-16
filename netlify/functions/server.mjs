// Note: dotenv n'est pas nécessaire sur Netlify car les variables d'environnement
// sont automatiquement injectées par Netlify. On l'importe quand même pour la compatibilité locale.
import 'dotenv/config';
import { GameStore } from '../../src/game.mjs';

// Instance globale du GameStore (partagée entre les invocations)
const store = new GameStore();

// Helper pour parser le body
async function parseBody(event) {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

// Helper pour les réponses
function respond(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-player-id',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
  }

  const path = event.path.replace('/.netlify/functions/server', '');
  const method = event.httpMethod;
  const body = await parseBody(event);
  const playerId = event.headers['x-player-id'];

  try {
    // POST /api/v1/parties - Créer une partie
    if (method === 'POST' && path === '/api/v1/parties') {
      const party = await store.createParty(body || {});
      return respond(200, party);
    }

    // GET /api/v1/parties/:code - Obtenir une partie
    if (method === 'GET' && path.match(/^\/api\/v1\/parties\/([A-Z0-9]+)$/)) {
      const code = path.split('/')[4];
      const snapshot = await store.getPartySnapshot(code);
      if (!snapshot) return respond(404, { message: 'Party not found' });
      return respond(200, snapshot);
    }

    // POST /api/v1/parties/:code/join - Rejoindre une partie
    if (method === 'POST' && path.match(/^\/api\/v1\/parties\/[A-Z0-9]+\/join$/)) {
      const code = path.split('/')[4];
      const result = await store.joinParty(code, body.nickname, {
        groupId: body.groupId ?? null,
        groupIndex: Number.isInteger(body.groupIndex) ? body.groupIndex : (body.groupIndex ? Number(body.groupIndex) : null),
        createGroup: !!body.createGroup,
      });
      return respond(200, result);
    }

    // POST /api/v1/parties/:code/statements - Soumettre énoncés
    if (method === 'POST' && path.match(/^\/api\/v1\/parties\/[A-Z0-9]+\/statements$/)) {
      const code = path.split('/')[4];
      if (!playerId) return respond(401, { message: 'Missing x-player-id' });
      await store.submitPhase1Statements(code, playerId, body.items);
      return respond(200, { ok: true });
    }

    // POST /api/v1/parties/:code/start-phase1
    if (method === 'POST' && path.match(/^\/api\/v1\/parties\/[A-Z0-9]+\/start-phase1$/)) {
      const code = path.split('/')[4];
      if (!playerId) return respond(401, { message: 'Missing x-player-id' });
      await store.startPhase1(code, playerId);
      return respond(200, { ok: true });
    }

    // POST /api/v1/parties/:code/start-phase2
    if (method === 'POST' && path.match(/^\/api\/v1\/parties\/[A-Z0-9]+\/start-phase2$/)) {
      const code = path.split('/')[4];
      if (!playerId) return respond(401, { message: 'Missing x-player-id' });
      await store.startPhase2(code, playerId);
      return respond(200, { ok: true });
    }

    // POST /api/v1/rounds/:roundId/vote
    if (method === 'POST' && path.match(/^\/api\/v1\/rounds\/[^\/]+\/vote$/)) {
      const roundId = path.split('/')[4];
      if (!playerId) return respond(401, { message: 'Missing x-player-id' });
      await store.vote(roundId, playerId, body.statementId);
      return respond(200, { ok: true });
    }

    // POST /api/v1/rounds/:roundId/close
    if (method === 'POST' && path.match(/^\/api\/v1\/rounds\/[^\/]+\/close$/)) {
      const roundId = path.split('/')[4];
      if (!playerId) return respond(401, { message: 'Missing x-player-id' });
      await store.closeRound(roundId, playerId);
      return respond(200, { ok: true });
    }

    // DELETE /api/v1/parties/:code/players/:playerId
    if (method === 'DELETE' && path.match(/^\/api\/v1\/parties\/[A-Z0-9]+\/players\/[^\/]+$/)) {
      const parts = path.split('/');
      const code = parts[4];
      const playerIdToRemove = parts[6];
      await store.removePlayer(code, playerIdToRemove);
      return respond(200, { ok: true });
    }

    // POST /api/v1/parties/:code/players/:playerId/remove (fallback)
    if (method === 'POST' && path.match(/^\/api\/v1\/parties\/[A-Z0-9]+\/players\/[^\/]+\/remove$/)) {
      const parts = path.split('/');
      const code = parts[4];
      const playerIdToRemove = parts[6];
      await store.removePlayer(code, playerIdToRemove);
      return respond(200, { ok: true });
    }

    // Route non trouvée
    return respond(404, { message: 'Not found' });

  } catch (error) {
    console.error('Error:', error);
    return respond(500, { message: error.message || 'Internal server error' });
  }
}

