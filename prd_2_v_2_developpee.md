# PRD V2 — 2V1M (Deux Vérités et un Mensonge)

## 1. Résumé Produit
2V1M est un jeu web d’ice breaker, jouable en 5 à 12 minutes, sans création de compte obligatoire.  
Un hôte crée une partie, définit un ou plusieurs groupes, partage un lien, et chaque groupe joue sa session indépendante.

Objectif utilisateur: vivre un moment social rapide et engageant.  
Objectif business: maximiser la complétion de parties et la rejouabilité.

## 2. Problème à Résoudre
Les ice breakers existants sont souvent trop longs à installer, peu clairs dans leurs règles, ou peu adaptés au mobile.

2V1M répond à ces freins:
- Démarrage en moins de 30 secondes.
- Interface lisible en une action principale par écran.
- Règles immédiatement compréhensibles.
- Parties courtes et répétables.

## 3. Objectifs et Non-Objectifs
### 3.1 Objectifs V1
- Créer une partie rapidement via lien partagé.
- Supporter 1..N groupes jouant en parallèle.
- Garantir un scoring équitable basé sur justesse + rapidité.
- Afficher des résultats motivants par groupe et globaux.

### 3.2 Non-Objectifs V1
- Pas d’historique persistant inter-parties.
- Pas de comptes obligatoires.
- Pas de chat structuré ni réactions riches.
- Pas de personnalisation graphique avancée.

## 4. Cibles Utilisateurs
- Facilitateur en entreprise.
- Enseignant ou animateur de workshop.
- Groupe d’amis en présentiel ou visio.
- Participant mobile-only.

## 5. Définitions et Glossaire
- Partie: conteneur global avec un code/lien unique.
- Groupe: sous-ensemble de joueurs avec session indépendante.
- Session de groupe: enchaînement de manches d’un groupe.
- Manche: tour avec un narrateur et des votants.
- Narrateur: joueur qui propose 2 vérités + 1 mensonge.
- Votant: joueur éligible à la question et au vote durant une manche.

## 6. Expérience Utilisateur Cible
1. L’hôte crée une partie et choisit le nombre de groupes.
2. Les joueurs rejoignent via lien.
3. Les joueurs sont affectés automatiquement ou manuellement aux groupes.
4. Chaque groupe joue ses manches Phase 1.
5. Les résultats de groupe sont annoncés.
6. Les meilleurs menteurs passent en Phase 2 (Cour des Menteurs).
7. Le score total est consolidé.
8. Un gagnant final est annoncé.

Temps cible:
- Setup: < 30 s.
- Onboarding joueur: < 20 s.
- Manche: 60 à 180 s.
- Partie complète: 5 à 12 min.

## 7. Règles de Jeu Détaillées
### 7.1 Structure de Partie
- Une partie contient 1..N groupes.
- Chaque groupe a sa propre session Phase 1.
- Le nombre de manches en Phase 1 d’un groupe = nombre de joueurs du groupe.
- Chaque joueur est narrateur une seule fois en Phase 1.

### 7.2 Déroulé Standard d’une Manche
1. Sélection du narrateur (ordre défini au démarrage de la session).
2. Saisie des 3 énoncés par le narrateur.
3. Mélange aléatoire des énoncés côté serveur.
4. Phase de questions libres (option: timer global de manche).
5. Vote irréversible des votants, avec timestamp serveur.
6. Révélation automatique à fin de condition.
7. Calcul et affichage des points de manche.

Conditions de fin de manche:
- Tous les votants ont voté, ou
- Timer expiré.

### 7.3 Scoring Phase 1
Notations:
- `V` = nombre de votants de la manche (joueurs du groupe hors narrateur).
- `R` = rang de rapidité parmi les votes corrects (1 = plus rapide).

Règle:
- Points d’un vote correct = `V - R + 1`.
- Vote incorrect ou absence de vote = `0`.
- Narrateur = `0` point sur sa manche.

Exemple:
- Groupe de 5 joueurs, donc `V=4`.
- 3 votes corrects classés par temps:
- Rang 1 = 4 points.
- Rang 2 = 3 points.
- Rang 3 = 2 points.

### 7.4 Distinction "Meilleur Menteur" (Phase 1)
Pour chaque narrateur, calculer:
- `LeakScore` = somme des points gagnés par les autres pendant sa manche.

Le meilleur menteur d’un groupe est le narrateur avec le `LeakScore` minimal.
Égalité autorisée.

### 7.5 Phase 2 — Cour des Menteurs
Participants narrateurs:
- Les meilleurs menteurs de chaque groupe.

Votants éligibles:
- Tous les autres joueurs de la partie.
- Exclusion: un joueur ne peut pas voter sur un narrateur qu’il a déjà vu en Phase 1.

Scoring Phase 2:
- `V2` = nombre de votants éligibles.
- `M` = multiplicateur (V1: `M=2`).
- Points d’un vote correct au rang `R` = `(V2 - R + 1) * M`.
- Vote incorrect ou absence de vote = `0`.

### 7.6 Gagnants
- Gagnant de groupe (Phase 1): score individuel maximal du groupe.
- Gagnant final partie: score total maximal `Phase 1 + Phase 2`.
- Titre final: Roi/Reine des Perspicaces.

## 8. Exigences Fonctionnelles
### 8.1 Création et Accès
- FR-001: L’hôte peut créer une partie en un écran.
- FR-002: Le système génère un lien unique partageable.
- FR-003: Les joueurs rejoignent sans compte.
- FR-004: Un pseudo est requis et unique dans la partie.

### 8.2 Gestion de Groupes
- FR-010: L’hôte définit le nombre de groupes (min 1, max configurable).
- FR-011: Affectation automatique équilibrée disponible.
- FR-012: Réaffectation manuelle avant démarrage disponible.
- FR-013: Un groupe ne peut pas démarrer à moins de 3 joueurs (règle configurable).

### 8.3 Gameplay
- FR-020: Le narrateur saisit exactement 3 énoncés.
- FR-021: Le système impose "2 vérités + 1 mensonge" via sélection explicite côté narrateur.
- FR-022: Les 3 cartes sont affichées dans un ordre aléatoire pour les votants.
- FR-023: Le vote est irréversible.
- FR-024: Le timestamp de vote est serveur uniquement.
- FR-025: La manche se termine automatiquement selon les règles.

### 8.4 Scoring et Résultats
- FR-030: Le scoring par rang est calculé automatiquement.
- FR-031: Le classement est mis à jour en temps réel après chaque manche.
- FR-032: Le meilleur menteur est calculé en fin de Phase 1 par groupe.
- FR-033: La Phase 2 est déclenchable par l’hôte.
- FR-034: Le score final consolidé est affiché avec gestion des ex aequo.

### 8.5 Reconnexion et Résilience
- FR-040: Un joueur déconnecté peut revenir via le lien et son pseudo.
- FR-041: Si le narrateur se déconnecte, la manche passe en pause jusqu’au timeout de reprise.
- FR-042: Si un votant se déconnecte, il est compté "absence de vote" à expiration du timer.

## 9. Exigences Non Fonctionnelles
- NFR-001: Mobile-first, support iOS Safari et Android Chrome récents.
- NFR-002: Temps de latence perçu pour action critique < 300 ms hors réseau dégradé.
- NFR-003: Disponibilité cible en session active > 99.5%.
- NFR-004: Synchronisation temps réel via WebSocket ou fallback SSE/polling.
- NFR-005: Données de partie éphémères avec TTL (ex: 24 h).
- NFR-006: Pas de collecte de données sensibles hors nécessaire opérationnel.
- NFR-007: Internationalisation prête FR/EN (strings externalisées).

## 10. Données et Modèle Logique
Entités minimales:
- `Party(id, hostId, status, createdAt, config)`
- `Group(id, partyId, order, status)`
- `Player(id, partyId, groupId, nickname, connectedState)`
- `Round(id, groupId, phase, narratorId, status, startedAt, endedAt)`
- `Statement(id, roundId, text, isLie, displayOrder)`
- `Vote(id, roundId, playerId, statementId, createdAt, isCorrect, rankCorrect)`
- `Score(playerId, phase1, phase2, total)`

## 11. États et Transitions
### 11.1 Partie
- `LOBBY` -> `RUNNING_PHASE1` -> `RUNNING_PHASE2` -> `FINISHED`

### 11.2 Manche
- `DRAFT` -> `QUESTIONING` -> `VOTING` -> `REVEAL` -> `CLOSED`

Règles:
- Une transition est atomique côté serveur.
- Les clients affichent un état dérivé des événements serveurs.

## 12. Cas Limites et Règles d’Équité
- Égalité de timestamp de vote: bris d’égalité par ordre d’arrivée serveur (`voteId` croissant).
- Groupe à 2 joueurs: mode dégradé non classant ou blocage selon config.
- Absence de vote généralisée: manche valide, tous à 0 sauf cas de vote correct.
- Narrateur inactif: annulation ou remplacement selon règle hôte.
- Ex aequo final: co-gagnants affichés.

## 13. UX/UI — Spécification d’Écrans
### 13.1 Landing
- CTA principal: Créer une partie.
- CTA secondaire: Rejoindre via code.

### 13.2 Lobby hôte
- Paramètres: groupes, timer de manche, auto-assign.
- Liste joueurs en temps réel.
- Démarrage verrouillé si contraintes non satisfaites.

### 13.3 Salle joueur
- Groupe assigné, état de partie, feedback connexion.
- Rappel des règles en 1 bloc compact.

### 13.4 Écran manche
- Zone questions (simple fil texte local de session).
- Trois cartes de vote grandes, lisibles, tactiles.
- Timer et statut "vote envoyé".

### 13.5 Révélation/Score
- Mensonge surligné.
- Tableau points manche + cumul.
- Bouton suivant pour hôte, écran attente pour autres.

## 14. Instrumentation et KPI
- KPI-001: `time_to_create_party`.
- KPI-002: `join_success_rate`.
- KPI-003: `party_completion_rate`.
- KPI-004: `avg_round_duration`.
- KPI-005: `rematch_rate_24h`.
- KPI-006: `disconnect_recovery_rate`.

Événements analytiques minimum:
- `party_created`, `player_joined`, `group_assigned`, `round_started`, `vote_submitted`, `round_revealed`, `phase_changed`, `party_finished`.

## 15. Critères d’Acceptation (MVP)
### 15.1 Scénario A — Partie simple
- Avec 1 groupe de 4 joueurs, la partie exécute 4 manches en Phase 1.
- Chaque manche attribue les points selon rang de rapidité des votes corrects.
- Le classement final du groupe est visible sans rechargement.

### 15.2 Scénario B — Multi-groupes
- Avec 2 groupes, chaque groupe termine sa session indépendamment.
- Les meilleurs menteurs sont extraits correctement par groupe.
- La Phase 2 est jouable par les éligibles uniquement.

### 15.3 Scénario C — Résilience
- Si un votant se déconnecte puis revient avant fin de manche, il peut voter.
- Si non revenu à l’expiration, il reçoit 0 point sur la manche.

### 15.4 Scénario D — Équité
- Deux votes corrects simultanés sont ordonnés de façon déterministe côté serveur.
- Le narrateur ne peut jamais marquer de points sur sa propre manche.

## 16. Sécurité et Modération (Niveau MVP)
- Validation et sanitization des textes saisis.
- Limite de longueur par énoncé (ex: 180 caractères).
- Rate limiting basique sur création de parties et votes.
- Journal technique minimal des erreurs et transitions critiques.

## 17. Risques et Mitigations
- Risque: confusion des règles en première utilisation.
- Mitigation: onboarding ultra-court in-app avec exemple visuel.

- Risque: latence mobile réseau instable.
- Mitigation: UI optimiste sur vote + confirmation serveur visible.

- Risque: abandon avant fin.
- Mitigation: timer par défaut court + feedback de progression clair.

## 18. Plan de Livraison Recommandé
### Lot 1 (Fondations)
- Création/rejoindre partie, lobby, groupes, états de partie.

### Lot 2 (Gameplay Core)
- Manche standard complète, votes, révélation, scoring Phase 1.

### Lot 3 (Phase 2 et Finalisation)
- Meilleur menteur, Cour des Menteurs, score final consolidé.

### Lot 4 (Qualité)
- Reconnexion, observabilité, analytics, optimisation mobile.

## 19. Roadmap Post-MVP
- Comptes optionnels et historique.
- Modes avancés (rôles spéciaux, contraintes thématiques).
- Classements récurrents et statistiques personnelles.
- Packs d’animation pour facilitateurs.

## 20. Mantra Produit
Lancer vite. Comprendre instantanément. S’amuser sans expliquer.
