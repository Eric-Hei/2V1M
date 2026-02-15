# 2V1M — V3 Spécification Technique (MVP exécutable)

## 1. Objectif de ce document
Traduire la PRD produit en spécification technique directement implémentable:
- API HTTP + WebSocket
- Modèle de données
- Moteur de règles/scoring
- Flux front
- Backlog de livraison

## 2. Périmètre MVP confirmé
- Création/rejoindre partie sans compte
- Multi-groupes dans une même partie
- Phase 1 complète (manches, votes, scoring, classements)
- Distinction meilleur menteur par groupe
- Phase 2 (Cour des Menteurs) avec restrictions d’éligibilité
- Score final consolidé et gestion des ex aequo

Hors MVP:
- Historique long terme
- Profils utilisateurs
- Modération avancée

## 3. Architecture cible
- Frontend: SPA mobile-first (React/Next ou équivalent)
- Backend: API stateless + WebSocket room-based
- Stockage: PostgreSQL
- Cache/temps réel: Redis (présence, verrous, pub/sub)

Principe:
- Le serveur est source de vérité des états, timers et timestamps.
- Le client n’exécute pas de logique de score autoritative.

## 4. États métier
### Partie
- `LOBBY`
- `RUNNING_PHASE1`
- `RUNNING_PHASE2`
- `FINISHED`

### Groupe
- `WAITING`
- `PLAYING`
- `DONE`

### Manche
- `DRAFT`
- `QUESTIONING`
- `VOTING`
- `REVEAL`
- `CLOSED`

Transitions:
- Atomicité garantie par transaction DB + lock Redis (`party:{id}:lock`).

## 5. Modèle de données SQL (minimal)
```sql
create table parties (
  id uuid primary key,
  code varchar(8) unique not null,
  host_player_id uuid null,
  status varchar(20) not null,
  phase2_multiplier int not null default 2,
  round_timer_sec int not null default 120,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table groupes (
  id uuid primary key,
  party_id uuid not null references parties(id) on delete cascade,
  idx int not null,
  status varchar(20) not null,
  unique(party_id, idx)
);

create table joueurs (
  id uuid primary key,
  party_id uuid not null references parties(id) on delete cascade,
  group_id uuid null references groupes(id) on delete set null,
  nickname varchar(32) not null,
  is_host boolean not null default false,
  connected boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(party_id, nickname)
);

create table manches (
  id uuid primary key,
  party_id uuid not null references parties(id) on delete cascade,
  group_id uuid not null references groupes(id) on delete cascade,
  phase smallint not null, -- 1 or 2
  idx int not null,
  narrator_id uuid not null references joueurs(id),
  status varchar(20) not null,
  started_at timestamptz null,
  ended_at timestamptz null,
  unique(group_id, phase, idx)
);

create table enonces (
  id uuid primary key,
  round_id uuid not null references manches(id) on delete cascade,
  text varchar(180) not null,
  is_lie boolean not null,
  display_order smallint not null
);

create table votes (
  id bigserial primary key,
  round_id uuid not null references manches(id) on delete cascade,
  player_id uuid not null references joueurs(id) on delete cascade,
  statement_id uuid not null references enonces(id) on delete cascade,
  is_correct boolean not null,
  rank_correct int null,
  points int not null default 0,
  created_at timestamptz not null default now(),
  unique(round_id, player_id)
);

create table scores (
  party_id uuid not null references parties(id) on delete cascade,
  player_id uuid not null references joueurs(id) on delete cascade,
  phase1 int not null default 0,
  phase2 int not null default 0,
  total int not null default 0,
  primary key (party_id, player_id)
);
```

## 6. API HTTP (contrats MVP)
Base: `/api/v1`

### 6.1 Partie
- `POST /parties`
  - body: `{ "groups": 2, "roundTimerSec": 120 }`
  - response: `{ "partyId": "...", "code": "AB12CD", "joinUrl": "..." }`

- `GET /parties/{code}`
  - response: snapshot lobby/partie

- `POST /parties/{code}/start-phase1`
  - host only

- `POST /parties/{code}/start-phase2`
  - host only

### 6.2 Joueurs
- `POST /parties/{code}/join`
  - body: `{ "nickname": "Erich" }`
  - response: `{ "playerId": "...", "token": "jwt-session" }`

- `POST /parties/{code}/assignments`
  - host only
  - body: `{ "assignments": [{ "playerId":"...", "groupId":"..." }] }`

### 6.3 Manches
- `POST /rounds/{roundId}/statements`
  - narrator only
  - body:
  - `{ "items": [ {"text":"...", "isLie":false}, {"text":"...", "isLie":false}, {"text":"...", "isLie":true} ] }`

- `POST /rounds/{roundId}/vote`
  - voter eligible only
  - body: `{ "statementId":"..." }`
  - idempotence: second vote rejected `409 ALREADY_VOTED`

- `POST /rounds/{roundId}/close`
  - host/system only (timer or all voted)

## 7. WebSocket events
Channel: `party:{partyId}`

Server -> clients:
- `party.updated`
- `player.joined`
- `player.reconnected`
- `group.updated`
- `round.started`
- `round.questioning`
- `round.voting`
- `round.voteAccepted` (sans révéler la vérité)
- `round.revealed` (lieId + points + ranks)
- `score.updated`
- `phase.changed`
- `party.finished`

Client -> server:
- `presence.ping`
- `round.submitStatements`
- `round.submitVote`

## 8. Règles de scoring (implémentation)
### 8.1 Phase 1
- `V = nb votants éligibles`
- Récupérer votes corrects triés par `(created_at asc, id asc)`
- Pour le i-ème correct (`i` commence à 1): `points = V - i + 1`
- Incorrect/absent = `0`

### 8.2 Meilleur menteur
Pour chaque narrateur:
- `LeakScore = sum(points des autres sur la manche)`
- Min `LeakScore` = meilleur menteur du groupe (ex aequo possible)

### 8.3 Phase 2
- `V2 = nb votants éligibles`
- `M = party.phase2_multiplier` (default 2)
- i-ème vote correct: `points = (V2 - i + 1) * M`

### 8.4 Consolidation
- `scores.total = scores.phase1 + scores.phase2`
- Co-gagnants si égalité sur `total`.

## 9. Règles d’éligibilité Phase 2
Un joueur `P` ne peut pas voter pour narrateur `N` en Phase 2 si:
- `P` était dans le même groupe que `N` en Phase 1.

Implémentation:
- table ou vue dérivée `phase1_seen_narrators(player_id, narrator_id)`.

## 10. Validation et erreurs API
Codes:
- `400` payload invalide
- `401` token absent/invalide
- `403` rôle non autorisé
- `404` ressource absente
- `409` conflit état (déjà voté, mauvais état de manche)
- `422` règle métier (3 énoncés non conformes)

Messages d’erreur courts et stables (`code`, `message`).

## 11. Sécurité MVP
- JWT session signé (durée: 24h)
- Rate limiting:
  - create party: 20/h/IP
  - join: 60/h/IP
  - vote: 120/min/player
- Sanitization texte + longueur max 180 caractères

## 12. Résilience et reconnexion
- Heartbeat WS toutes les 15 s
- Déconnexion > 30 s: `connected=false`
- Rejoin via code + pseudo + token:
  - reprendre identité si token valide
  - sinon flow "reclaim nickname" (OTP simple optionnel post-MVP)

## 13. UX flows critiques
### 13.1 Host happy path
1. Create party
2. Share link
3. Assign groups
4. Start phase 1
5. Start phase 2
6. Finish

### 13.2 Player happy path
1. Join with nickname
2. Wait lobby
3. Play rounds
4. Vote quickly
5. See reveal + leaderboard

## 14. Backlog de livraison (sprints)
### Sprint 1
- Schéma DB + migrations
- `POST /parties`, `join`, lobby snapshot
- WebSocket présence de base

### Sprint 2
- Orchestrateur de manche phase 1
- Saisie narrateur + vote + révélation
- Scoring phase 1 + leaderboard live

### Sprint 3
- Meilleur menteur + phase 2
- Éligibilité votants + multiplicateur
- Score final + écran fin

### Sprint 4
- Reconnexion robuste
- Instrumentation KPI
- Hardening (rate limit, tests e2e)

## 15. Plan de tests
### Unit tests
- Calcul des ranks corrects avec égalité de timestamp
- Calcul des points phase 1/phase 2
- Extraction meilleur menteur

### Integration tests
- Workflow complet 1 groupe / 4 joueurs
- Workflow 2 groupes + phase 2
- Reconnexion votant avant/après expiration

### E2E
- Mobile viewport principal
- Partie complète sans refresh
- Ex aequo final

## 16. Observabilité
- Logs structurés: `partyId`, `groupId`, `roundId`, `playerId`
- Metrics:
  - `api_latency_ms`
  - `ws_connected_clients`
  - `round_duration_sec`
  - `vote_submission_rate`
  - `party_completion_rate`

## 17. Décisions produit à figer avant build
- Taille max partie (ex: 40 joueurs)
- Min joueurs par groupe (2 ou 3)
- Timer par défaut (90, 120, 180 s)
- Questions libres: via voix externe uniquement ou fil texte in-app

## 18. Definition of Done MVP
- Tous critères d’acceptation V2 passants
- 0 bug bloquant sur workflow complet
- Temps création partie médian < 30 s
- Taux de complétion en test pilot >= 70%
