# Mode Spectateur - Documentation

## Vue d'ensemble

Le mode spectateur permet de suivre une partie de 2V1M en temps réel sur un écran séparé, sans participer au jeu. Idéal pour :
- 📺 Projection sur grand écran lors d'événements
- 🎥 Streaming pour audiences externes
- 👥 Suivi à distance pour organisateurs
- 🖥️ Multi-écrans pour grandes parties

## Fonctionnalités

### 1. URL Dédiée
Chaque partie dispose d'une URL spectateur unique :
```
http://localhost:3000/spectate/{CODE}
```

### 2. Tableau de Scores Live
- Affichage en temps réel pendant Phase 1 et Phase 2
- Classement automatique par score total
- Détails des scores : Phase 1, Phase 2, Total
- Mise en évidence du leader
- Mise à jour automatique toutes les secondes

### 3. Vue Synchronisée
- Suit automatiquement les manches actives
- Affiche les énoncés en cours de vote
- Montre les révélations en temps réel
- Passe automatiquement aux écrans de résultats

### 4. Interface Adaptée
- **Desktop** : Scoreboard flottant à droite
- **Mobile** : Scoreboard intégré en haut
- Pas de contrôles joueur
- Indicateur "Spectateur" dans l'en-tête

## Utilisation

### Étape 1 : Créer une partie
1. Ouvrir `http://localhost:3000`
2. Cliquer sur "Créer une partie"
3. Noter le code généré (ex: `RLXTW`)

### Étape 2 : Obtenir le lien spectateur
Dans le lobby, vous verrez une carte "📺 Mode Spectateur" avec :
- L'URL complète du mode spectateur
- Un bouton "📋 Copier" pour copier le lien

### Étape 3 : Partager le lien
- Envoyez le lien par email, SMS, chat, etc.
- Ou ouvrez-le directement sur un autre appareil
- Le mode spectateur se lance automatiquement

## Implémentation Technique

### Architecture
```
Client (Browser)
    ↓
URL Detection (/spectate/:code)
    ↓
Auto-join as Spectator (playerId = null)
    ↓
Polling Loop (1s interval)
    ↓
GET /api/v1/parties/:code
    ↓
Render UI (scores, rounds, reveals)
```

### Fichiers Modifiés

#### `public/index.html`
- Ajout de `state.isSpectatorMode`
- Fonction `checkUrlAndAutoJoin()` pour détecter `/spectate/:code`
- Composant `live-scoreboard` avec styles CSS
- Fonction `renderLiveScoreboard(s)` pour afficher les scores
- Bouton de copie du lien spectateur dans le lobby
- Logique de rendu adaptée pour spectateurs

#### `src/server.mjs`
- Route catch-all pour servir `index.html` sur toutes les routes non-API
- Support du routing côté client

#### Documentation
- `README.md` : Section "Mode Spectateur"
- `prd_2_v_3_spec_technique.md` : Section détaillée avec cas d'usage
- `test-spectator.sh` : Script de test automatisé

### Flux de Données

```javascript
// 1. Détection de l'URL au chargement
window.addEventListener('DOMContentLoaded', () => {
  checkUrlAndAutoJoin();
});

// 2. Auto-join en mode spectateur
function checkUrlAndAutoJoin() {
  const spectateMatch = path.match(/^\/spectate\/([A-Z0-9]+)$/i);
  if (spectateMatch) {
    state.code = spectateMatch[1].toUpperCase();
    state.playerId = null; // Spectator mode
    state.isSpectatorMode = true;
    startPolling();
  }
}

// 3. Affichage du scoreboard
function render() {
  const shouldShowLiveScores = 
    (s.status === 'RUNNING_PHASE1' || s.status === 'RUNNING_PHASE2') && 
    (!state.playerId || (myGroup && myGroup.status === 'DONE'));
  
  if (shouldShowLiveScores) {
    renderLiveScoreboard(s);
    $('live-scoreboard').classList.remove('hidden');
  }
}
```

## Tests

### Test Manuel
1. Créer une partie : `http://localhost:3000`
2. Rejoindre avec 2+ joueurs
3. Ouvrir le lien spectateur dans un autre onglet/navigateur
4. Démarrer la partie
5. Vérifier que le scoreboard se met à jour en temps réel

### Test Automatisé
```bash
./test-spectator.sh
```

Ce script :
- Crée une partie
- Ajoute 2 joueurs
- Affiche l'URL spectateur
- Vérifie que le snapshot contient les joueurs

## Statuts des Joueurs (v0.1.20+)

Le panneau spectateur affiche en temps réel le statut de chaque joueur. Voici les états possibles :

| Phase | Condition | Emoji | Texte | CSS Class |
|---|---|---|---|---|
| LOBBY | Énoncés non soumis | ⏳ | En attente | `status-waiting` |
| LOBBY | Énoncés soumis | ✅ | Prêt | `status-ready` |
| RUNNING_PHASE1_PREP | En train de rédiger | ✏️ | Rédige... | `status-writing` |
| RUNNING_PHASE1_PREP | Énoncés soumis | ✅ | Prêt | `status-ready` |
| RUNNING_PHASE1 | Groupe terminé | 🏁 | Groupe terminé | `status-done` |
| RUNNING_PHASE1 | Pas de round actif | ⏳ | Entre les manches | `status-waiting` |
| RUNNING_PHASE1 | C'est le narrateur | 🎤 | Narrateur | `status-narrator` |
| RUNNING_PHASE1 | Round en QUESTIONING | 👂 | Écoute | `status-listening` |
| RUNNING_PHASE1 | Round en VOTING, n'a pas voté | 🗳️ | Vote... | `status-voting` |
| RUNNING_PHASE1 | Round en VOTING, a voté | ✅ | A voté | `status-voted` |
| RUNNING_PHASE2 | C'est le narrateur | 🎤 | Narrateur | `status-narrator` |
| RUNNING_PHASE2 | Round en QUESTIONING | 👂 | Écoute | `status-listening` |
| RUNNING_PHASE2 | Round en VOTING, n'a pas voté | 🗳️ | Vote... | `status-voting` |
| RUNNING_PHASE2 | Round en VOTING, a voté | ✅ | A voté | `status-voted` |
| FINISHED | Toujours | 🏁 | Terminé | `status-finished` |

### Logique de détermination

La fonction `getPlayerStatus(player, snapshot)` détermine le statut en combinant :
1. **`snapshot.status`** : la phase de la partie
2. **`phaseTiming.phase1Prep.submittedPlayers`** : qui a soumis ses énoncés
3. **Le groupe du joueur** et son `status` (WAITING, PLAYING, DONE)
4. **Le `currentRound` du groupe** : le round actif
5. **`currentRound.narratorId`** : est-ce le narrateur ?
6. **`currentRound.voterIds`** : liste des joueurs ayant voté (exposé par le backend)
7. **`currentRound.status`** : QUESTIONING vs VOTING

### Données backend nécessaires

Le champ `voterIds` est exposé dans `#publicRound()` :
```javascript
// round.voterIds = [playerId1, playerId2, ...]
// Extrait depuis round.votes (Map en phase 1, Array en phase 2)
```

## Limitations Actuelles

- ❌ Pas de SSE pour le mode spectateur (utilise polling)
- ❌ Pas de contrôle de la vue (suit automatiquement)

## Améliorations Futures

- [ ] SSE pour mises à jour push au lieu de polling
- [ ] Graphiques de progression des scores
- [ ] Historique des manches
- [ ] Statistiques détaillées (taux de réussite, temps moyen, etc.)
- [ ] Mode "Replay" pour revoir une partie terminée
- [ ] Personnalisation de l'affichage (thèmes, taille, etc.)

