import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import { GameStore } from './game.mjs';

const store = new GameStore();
const sseByCode = new Map();

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendEvent(res, event, payload) {
  if (event) {
    res.write(`event: ${event}\n`);
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(code, event, payload) {
  const key = code?.toUpperCase();
  if (!key) return;
  const listeners = sseByCode.get(key);
  if (!listeners || listeners.size === 0) return;
  for (const res of listeners) {
    sendEvent(res, null, payload); // Standard "message" event for broad compatibility
    sendEvent(res, event, payload);
  }
}

function notFound(res) {
  send(res, 404, { error: { code: 'NOT_FOUND', message: 'route not found' } });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('invalid JSON body');
    err.status = 400;
    throw err;
  }
}

function getActorId(req) {
  return req.headers['x-player-id'] || null;
}

function routeKey(method, pathname) {
  return `${method} ${pathname}`;
}

async function snapshotForRound(roundId) {
  const round = store.rounds.get(roundId);
  if (!round) return null;
  const party = store.partiesById.get(round.partyId);
  if (!party) return null;
  return await store.getPartySnapshot(party.code);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const urlPath = url.pathname;
  const parts = urlPath.split('/').filter(Boolean);

  try {
    if (routeKey(req.method, urlPath) === 'GET /') {
      const indexPath = path.resolve(process.cwd(), 'public', 'index.html');
      const html = fs.readFileSync(indexPath, 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && urlPath.match(/^\/api\/v1\/events\/[^/]+$/)) {
      const code = urlPath.split('/')[4].toUpperCase();
      if (!(await store.getPartyByCode(code))) {
        return send(res, 404, { error: { code: 'PARTY_NOT_FOUND', message: 'party not found' } });
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write('\n');

      if (!sseByCode.has(code)) sseByCode.set(code, new Set());
      sseByCode.get(code).add(res);

      const snapshot = await store.getPartySnapshot(code);
      sendEvent(res, 'party.snapshot', { snapshot });

      req.on('close', () => {
        const listeners = sseByCode.get(code);
        listeners?.delete(res);
        if (listeners && listeners.size === 0) sseByCode.delete(code);
      });
      return;
    }

    if (routeKey(req.method, urlPath) === 'POST /api/v1/parties') {
      const body = await readBody(req);
      const out = await store.createParty(body);
      return send(res, 201, out);
    }

    if (
      req.method === 'DELETE' &&
      parts.length === 6 &&
      parts[0] === 'api' &&
      parts[1] === 'v1' &&
      parts[2] === 'parties' &&
      parts[4] === 'players'
    ) {
      const code = parts[3].toUpperCase();
      const playerId = parts[5];
      const snapshot = await store.removePlayer(code, playerId);
      broadcast(code, 'party.updated', { snapshot });
      return send(res, 200, { ok: true, snapshot });
    }

    if (
      req.method === 'POST' &&
      parts.length === 7 &&
      parts[0] === 'api' &&
      parts[1] === 'v1' &&
      parts[2] === 'parties' &&
      parts[4] === 'players' &&
      parts[6] === 'remove'
    ) {
      const code = parts[3].toUpperCase();
      const playerId = parts[5];
      const snapshot = await store.removePlayer(code, playerId);
      broadcast(code, 'party.updated', { snapshot });
      return send(res, 200, { ok: true, snapshot });
    }

    if (req.method === 'GET' && urlPath.startsWith('/api/v1/parties/')) {
      const code = urlPath.split('/').at(-1);
      const snapshot = await store.getPartySnapshot(code);
      if (!snapshot) return send(res, 404, { error: { code: 'PARTY_NOT_FOUND', message: 'party not found' } });
      return send(res, 200, snapshot);
    }

    if (req.method === 'POST' && urlPath.match(/^\/api\/v1\/parties\/[^/]+\/join$/)) {
      const code = urlPath.split('/')[4].toUpperCase();
      const body = await readBody(req);
      const out = await store.joinParty(code, body.nickname, {
        groupId: body.groupId ?? null,
        groupIndex: Number.isInteger(body.groupIndex) ? body.groupIndex : (body.groupIndex ? Number(body.groupIndex) : null),
        createGroup: !!body.createGroup,
      });
      broadcast(code, 'party.updated', { snapshot: await store.getPartySnapshot(code) });
      return send(res, 201, out);
    }

    if (req.method === 'POST' && urlPath.match(/^\/api\/v1\/parties\/[^/]+\/statements$/)) {
      const code = urlPath.split('/')[4].toUpperCase();
      const body = await readBody(req);
      const actorId = getActorId(req) || body.playerId || url.searchParams.get('playerId');
      const snapshot = await store.submitPhase1Statements(code, actorId, body.items);
      broadcast(code, 'party.updated', { snapshot });
      return send(res, 200, { ok: true, snapshot });
    }

    if (req.method === 'POST' && urlPath.match(/^\/api\/v1\/parties\/[^/]+\/start-phase1$/)) {
      const code = urlPath.split('/')[4].toUpperCase();
      const body = await readBody(req);
      const actorId = getActorId(req) || body.playerId || url.searchParams.get('playerId');
      const snapshot = await store.startPhase1(code, actorId);
      broadcast(code, 'party.updated', { snapshot });
      return send(res, 200, snapshot);
    }

    if (req.method === 'POST' && urlPath.match(/^\/api\/v1\/parties\/[^/]+\/start-phase2$/)) {
      const code = urlPath.split('/')[4].toUpperCase();
      const body = await readBody(req);
      const actorId = getActorId(req) || body.playerId || url.searchParams.get('playerId');
      const snapshot = store.startPhase2(code, actorId);
      broadcast(code, 'party.updated', { snapshot });
      return send(res, 200, snapshot);
    }

    if (req.method === 'POST' && urlPath.match(/^\/api\/v1\/rounds\/[^/]+\/statements$/)) {
      const roundId = urlPath.split('/')[4];
      const actorId = getActorId(req);
      const body = await readBody(req);
      const out = store.submitStatements(roundId, actorId, body.items);
      const snapshot = snapshotForRound(roundId);
      if (snapshot) broadcast(snapshot.code, 'party.updated', { snapshot });
      return send(res, 200, out);
    }

    if (req.method === 'POST' && urlPath.match(/^\/api\/v1\/rounds\/[^/]+\/vote$/)) {
      const roundId = urlPath.split('/')[4];
      const actorId = getActorId(req);
      const body = await readBody(req);
      const out = store.vote(roundId, actorId, body.statementId);
      const snapshot = snapshotForRound(roundId);
      if (snapshot) broadcast(snapshot.code, 'party.updated', { snapshot });
      return send(res, 200, out);
    }

    if (req.method === 'POST' && urlPath.match(/^\/api\/v1\/rounds\/[^/]+\/close$/)) {
      const roundId = urlPath.split('/')[4];
      const body = await readBody(req);
      const actorId = getActorId(req) || body.playerId || url.searchParams.get('playerId');
      const snapshot = store.closeRound(roundId, actorId);
      broadcast(snapshot.code, 'party.updated', { snapshot });
      return send(res, 200, snapshot);
    }

    // POST /api/v1/sessions - Create a session (after join)
    if (req.method === 'POST' && urlPath === '/api/v1/sessions') {
      const body = await readBody(req);
      if (!body.playerId || !body.code) {
        return send(res, 400, { error: { code: 'BAD_REQUEST', message: 'playerId and code are required' } });
      }
      const token = await store.createSession(body.playerId, body.code);
      return send(res, 201, { token });
    }

    // GET /api/v1/sessions/:token - Retrieve a session
    if (req.method === 'GET' && urlPath.match(/^\/api\/v1\/sessions\/[^/]+$/)) {
      const token = urlPath.split('/').at(-1);
      const session = await store.getSession(token);
      if (!session) return send(res, 404, { error: { code: 'SESSION_NOT_FOUND', message: 'session not found or expired' } });
      return send(res, 200, session);
    }

    if (routeKey(req.method, urlPath) === 'GET /health') {
      return send(res, 200, { ok: true });
    }

    // Serve index.html for all non-API GET requests (client-side routing)
    if (req.method === 'GET' && !urlPath.startsWith('/api/')) {
      const indexPath = path.resolve(process.cwd(), 'public', 'index.html');
      const html = fs.readFileSync(indexPath, 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    return notFound(res);
  } catch (error) {
    const status = error.status || 500;
    return send(res, status, {
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: error.message || 'unknown error',
      },
    });
  }
});

setInterval(() => {
  for (const listeners of sseByCode.values()) {
    for (const res of listeners) {
      res.write(': keepalive\n\n');
    }
  }
}, 15000).unref();

setInterval(() => {
  const updatedSnapshots = store.enforceDeadlines();
  for (const snapshot of updatedSnapshots) {
    broadcast(snapshot.code, 'party.updated', { snapshot });
  }
}, 1000).unref();

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`2V1M API listening on http://localhost:${port}`);
});
