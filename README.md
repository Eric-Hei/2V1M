# 🎭 2V1M - Deux Vérités et un Mensonge

> Un jeu d'ice breaker rapide et engageant pour briser la glace en 5-12 minutes !

## 🎮 Qu'est-ce que 2V1M ?

**2V1M** est un jeu icebreaker où les joueurs doivent deviner quel énoncé est un mensonge parmi trois propositions. Parfait pour :
- 🏢 Team building et événements d'entreprise
- 🎉 Soirées entre amis
- 🎓 Activités de groupe et formations
- 💻 Réunions virtuelles ou hybrides

### Comment jouer ?

1. **Un hôte crée une partie** et partage le code
2. **Les joueurs rejoignent** avec un simple pseudo (pas de compte requis)
3. **Chaque joueur propose** 2 vérités + 1 mensonge
4. **Les joueurs interrogent librement** le narrateur 
5. **Dès qu'ils pensent avoir trouvé le mensonge** ils votent
6. **Des points sont attribués** selon la justesse et la rapidité
7. **L'enquêteur le plus perspicace gagne** ! 🏆

## 🚀 Démarrage Rapide

### Installation

```bash
npm install
```

### Lancer le serveur

```bash
npm start
```

Le jeu sera accessible sur **[http://localhost:3000](http://localhost:3000)** 🎯

### Tester

```bash
npm test
```

## ✨ Fonctionnalités Principales

### 🎯 Deux Phases de Jeu

#### Phase 1 : Manches par Groupe
- Les joueurs sont répartis en groupes
- Chaque groupe joue ses manches indépendamment
- Chacun son tour devient narrateur et propose ses énoncés
- Les autres membres du groupe votent

#### Phase 2 : La Cour des Menteurs
- Les meilleurs menteurs de chaque groupe s'affrontent
- Multiplicateur de points pour plus de suspense
- Restrictions : on ne peut pas voter pour quelqu'un de son groupe Phase 1

### � Badges de Groupe Colorés

Chaque joueur voit clairement son groupe grâce à :
- **Badge permanent** en haut à droite de l'écran
- **6 couleurs distinctives** pour différencier les groupes
- **Affichage dans le lobby** avec badges colorés pour tous les joueurs

### 📺 Mode Spectateur

Suivez une partie en direct sur un autre écran :

1. **Créer une partie** et noter le code (ex: `RLXTW`)
2. **Copier le lien spectateur** depuis le lobby (bouton "📋 Copier")
3. **Ouvrir le lien** sur un autre appareil : `http://localhost:3000/spectate/RLXTW`

**Idéal pour** :
- 📽️ Projection sur grand écran lors d'événements
- 🎥 Streaming pour audiences externes
- 👀 Suivi à distance pour organisateurs
- 🖥️ Multi-écrans pour grandes parties

### ⚡ Temps Réel

- Mises à jour automatiques toutes les secondes
- Tableau de scores live
- Synchronisation automatique entre tous les appareils

## 📚 Documentation

- **[PRD & Spécifications Techniques](prd_2_v_3_spec_technique.md)** - Document de référence complet
- **[Mode Spectateur](SPECTATOR_MODE.md)** - Guide détaillé du mode spectateur
- **[Badges de Groupe](GROUP_BADGES.md)** - Documentation des indicateurs visuels

## 🛠️ Architecture Technique

### Stack
- **Backend** : Node.js avec API HTTP + SSE
- **Frontend** : HTML/CSS/JS vanilla (mobile-first)
- **Stockage** : En mémoire (pas de base de données pour le MVP)
- **Temps réel** : Polling 1s + SSE disponible

### Routes Web

| Route | Description |
|-------|-------------|
| `GET /` | Page d'accueil |
| `GET /spectate/:code` | Mode spectateur pour une partie |
| `GET /join/:code` | Pré-remplissage du code de partie |

### API Endpoints Principaux

<details>
<summary>Voir tous les endpoints</summary>

#### Gestion des Parties
- `POST /api/v1/parties` - Créer une partie
- `GET /api/v1/parties/{code}` - Obtenir l'état d'une partie
- `POST /api/v1/parties/{code}/join` - Rejoindre une partie
- `POST /api/v1/parties/{code}/start-phase1` - Démarrer la Phase 1
- `POST /api/v1/parties/{code}/start-phase2` - Démarrer la Phase 2

#### Gestion des Joueurs
- `DELETE /api/v1/parties/{code}/players/{playerId}` - Supprimer un joueur
- `POST /api/v1/parties/{code}/players/{playerId}/remove` - Fallback suppression

#### Gestion des Manches
- `POST /api/v1/parties/{code}/statements` - Soumettre ses énoncés (Phase 1)
- `POST /api/v1/rounds/{roundId}/statements` - Soumettre énoncés (narrateur)
- `POST /api/v1/rounds/{roundId}/vote` - Voter pour un énoncé
- `POST /api/v1/rounds/{roundId}/close` - Forcer la fin d'une manche

#### Temps Réel
- `GET /api/v1/events/{code}` - SSE pour mises à jour temps réel

</details>

## 🎯 Règles du Jeu

### Démarrage
- **Minimum** : 2 joueurs par groupe
- **Groupes** : Assignation manuelle dans le lobby
- **Démarrage automatique** : Quand tous les joueurs ont soumis leurs énoncés

### Scoring Phase 1
- Vote correct rapide = plus de points
- Classement par vitesse de détection
- Le meilleur menteur = celui qui a fait le moins de points aux autres

### Scoring Phase 2
- Multiplicateur x2 par défaut
- Seuls les meilleurs menteurs de chaque groupe participent
- Restriction : pas de vote pour quelqu'un de son groupe Phase 1

### Fin de Partie
- Classement final basé sur le score total (Phase 1 + Phase 2)
- Gestion des ex-aequo

## 🔧 Configuration

Le serveur peut être configuré via les paramètres de création de partie :

```javascript
{
  "groups": 3,                    // Nombre de groupes (0 = auto)
  "roundTimerSec": 120,           // Timer par manche (défaut: 120s)
  "phaseTimeLimitSec": 600,       // Limite de temps par phase (défaut: 600s)
  "statementTimeLimitSec": 120    // Temps pour écrire les énoncés (défaut: 120s)
}
```

## 🚀 Déploiement

Le projet est conçu pour être déployé sur **Netlify** via `netlify-cli`.

```bash
# Installation de Netlify CLI
npm install -g netlify-cli

# Déploiement
netlify deploy --prod
```

## 📝 Notes Techniques

- **Stockage en mémoire** : Les parties sont perdues au redémarrage du serveur
- **Auth simplifiée** : Via header `x-player-id` (pas de JWT pour le MVP)
- **Scoring côté serveur** : Toute la logique métier est calculée côté serveur
- **Modération légère** : Tout participant peut forcer la fin d'une manche
- **Pas de compte requis** : Jeu instantané avec juste un pseudo

## 🤝 Contribution

Ce projet est un MVP. Les contributions sont les bienvenues !

## 📄 Licence

MIT
