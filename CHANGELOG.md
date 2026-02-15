# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [0.1.0] - 2026-02-15

### 🎉 Ajouté

#### Mode Spectateur
- URL dédiée `/spectate/:code` pour suivre une partie sans jouer
- Tableau de scores live avec classement en temps réel
- Détails des scores par phase (Phase 1, Phase 2, Total)
- Bouton de copie du lien spectateur dans le lobby
- Routing côté client avec détection automatique de l'URL
- Polling automatique toutes les 1s pour mises à jour
- UI adaptée : scoreboard flottant (desktop) / intégré (mobile)
- Documentation complète dans `SPECTATOR_MODE.md`
- Script de test `test-spectator.sh`

#### Badges de Groupe Colorés
- Badge permanent en haut à droite affichant "👥 Groupe X"
- 6 couleurs distinctives avec gradients pour différencier les groupes
- Affichage des badges dans le lobby pour tous les joueurs
- Indicateur "(vous)" à côté du nom du joueur
- Classes CSS `.group-color-1` à `.group-color-6`
- Design responsive et accessible (contraste élevé)
- Documentation complète dans `GROUP_BADGES.md`

#### Documentation
- `README.md` refonte complète user-friendly avec emojis
- `SPECTATOR_MODE.md` guide détaillé du mode spectateur
- `GROUP_BADGES.md` documentation des indicateurs visuels
- `CHANGELOG.md` ce fichier pour suivre les versions
- Section "État d'Implémentation" dans le PRD
- Changelog détaillé dans le PRD (Section 19)

### 🐛 Corrigé

#### Création de Partie
- Erreur 500 lors de création avec body vide ou paramètres manquants
- Validation `Number.isInteger()` échouait sur `undefined`
- Conflit de nom : paramètre `code` écrasait la fonction `code()`
- Solution : Utilisation de `??` pour valeurs par défaut + renommage en `customCode`

#### Routing
- Ajout d'une route catch-all pour servir `index.html` sur toutes les routes non-API
- Support du client-side routing pour `/spectate/:code` et `/join/:code`

### 🔧 Amélioré

#### Architecture
- Stockage en mémoire via classe `GameStore`
- Auth simplifiée via header `x-player-id`
- Scoring et règles métier calculés côté serveur
- Polling 1s + SSE disponible pour temps réel

#### UX/UI
- Interface mobile-first responsive
- Mises à jour automatiques synchronisées
- Indicateurs visuels clairs (groupes, spectateur)
- Feedback visuel amélioré (badges, couleurs)

### 📝 Notes Techniques

- **Stockage** : En mémoire (pas de DB pour MVP)
- **Auth** : Header `x-player-id` (pas de JWT)
- **Temps réel** : Polling 1s (SSE disponible mais non utilisé)
- **Déploiement** : Prévu sur Netlify via `netlify-cli`

### 🎯 Métriques

- ✅ Création de partie : Fonctionnelle
- ✅ Multi-groupes : Opérationnel
- ✅ Phase 1 & Phase 2 : Complètes
- ✅ Mode spectateur : Testé et validé
- ✅ Badges de groupe : Validés
- ✅ Bugs bloquants : 0

---

## [Non publié]

### À venir (Post-MVP)

#### Persistance
- [ ] Migration vers PostgreSQL
- [ ] Cache Redis pour présence temps réel
- [ ] Historique des parties

#### Authentification
- [ ] Système de comptes utilisateurs
- [ ] Authentification JWT
- [ ] Profils joueurs

#### Fonctionnalités
- [ ] Mode replay pour revoir les parties
- [ ] Statistiques détaillées par joueur
- [ ] Personnalisation (thèmes, avatars)
- [ ] Modération avancée (signalement, bannissement)

#### Technique
- [ ] Tests de charge
- [ ] Monitoring et observabilité
- [ ] Documentation API (Swagger/OpenAPI)
- [ ] CI/CD automatisé

---

## Format

### Types de changements
- `Ajouté` pour les nouvelles fonctionnalités
- `Modifié` pour les changements aux fonctionnalités existantes
- `Déprécié` pour les fonctionnalités bientôt supprimées
- `Supprimé` pour les fonctionnalités supprimées
- `Corrigé` pour les corrections de bugs
- `Sécurité` pour les vulnérabilités corrigées

### Emojis
- 🎉 Ajouté
- 🔧 Amélioré
- 🐛 Corrigé
- 🔒 Sécurité
- 📝 Documentation
- 🎯 Métriques

