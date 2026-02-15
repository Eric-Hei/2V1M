# 2V1M MVP

Implémentation MVP jouable localement:
- API HTTP
- moteur de jeu (Phase 1 + Phase 2)
- interface web minimale
- mises à jour temps réel via SSE

## Lancer

```bash
cd /Users/erich/Documents/New\ project
npm start
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

## Tester

```bash
npm test
```

## Endpoints API

- `POST /api/v1/parties` (body supporte aussi `phaseTimeLimitSec`)
- `GET /api/v1/parties/{code}`
- `POST /api/v1/parties/{code}/join`
- `POST /api/v1/parties/{code}/statements` (saisie simultanée des 2 vérités + 1 mensonge en début de phase 1)
- `DELETE /api/v1/parties/{code}/players/{playerId}` (suppression participant, ouverte à tous en lobby)
- `POST /api/v1/parties/{code}/players/{playerId}/remove` (fallback suppression si `DELETE` non supporté)
- `POST /api/v1/parties/{code}/start-phase1` (header `x-player-id` = participant)
- `POST /api/v1/parties/{code}/start-phase2` (header `x-player-id` = participant)
- `POST /api/v1/rounds/{roundId}/statements` (header `x-player-id` = narrator)
- `POST /api/v1/rounds/{roundId}/vote` (header `x-player-id` = votant)
- `POST /api/v1/rounds/{roundId}/close` (header `x-player-id` = host)
- `GET /api/v1/events/{code}` (SSE temps réel)

## Notes techniques

- Stockage en mémoire (pas Postgres/Redis dans cette itération)
- Auth simplifiée via `x-player-id`
- Le scoring et les règles métier sont calculés côté serveur
- Fin de phase automatique: `all_played` ou `time_limit`, résultat disponible dans `snapshot.phaseResults`
- Résultat de phase enrichi: gagnant(s) avec points + meilleur temps de détection, et liste des joueurs qui se sont trompés
- Une partie peut démarrer à partir de 2 joueurs par groupe
- Toute personne déjà dans la partie peut démarrer la phase 2
- Phase 1 démarre automatiquement depuis le lobby quand tous les joueurs présents (min 2) ont soumis leurs énoncés
- Phase 2 n'est disponible que pour les parties avec au moins 2 groupes
- En lobby, chaque joueur rejoint un groupe existant (via `groupIndex`) ou crée un nouveau groupe (`createGroup=true`)
- Toute personne déjà dans la partie peut aussi forcer la fin de manche (action de modération légère)
- Nouveau flux phase 1: après démarrage, tous les joueurs écrivent en parallèle leurs 2 vérités + 1 mensonge; les manches de vote commencent ensuite automatiquement quand tout le monde a soumis (ou à la fin du timer de saisie)
