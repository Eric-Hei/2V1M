# Indicateurs Visuels de Groupe - Documentation

## Vue d'ensemble

Les joueurs peuvent maintenant **facilement identifier leur groupe** grâce à des badges colorés affichés de manière proéminente dans l'interface.

## Fonctionnalités

### 1. Badge de Groupe dans l'En-tête
- **Position**: En haut à droite de l'écran (position fixe)
- **Contenu**: Icône 👥 + "Groupe X"
- **Style**: Badge arrondi avec gradient de couleur
- **Visibilité**: Toujours visible pendant toute la partie

### 2. Badges dans le Lobby
- **Liste des joueurs**: Chaque joueur affiché avec son badge de groupe
- **Identification**: "(vous)" affiché à côté de votre nom
- **Couleurs cohérentes**: Même couleur que le badge d'en-tête

### 3. Palette de Couleurs

Chaque groupe a une couleur distinctive avec un gradient :

| Groupe | Couleurs | Gradient |
|--------|----------|----------|
| 1 | Indigo → Violet | #6366f1 → #8b5cf6 |
| 2 | Vert → Turquoise | #10b981 → #14b8a6 |
| 3 | Orange → Orange foncé | #f59e0b → #f97316 |
| 4 | Rose → Rouge | #ec4899 → #f43f5e |
| 5 | Bleu → Cyan | #3b82f6 → #06b6d4 |
| 6 | Violet → Magenta | #8b5cf6 → #d946ef |

Les couleurs se répètent cycliquement pour les groupes 7+.

## Implémentation Technique

### Structure HTML

#### En-tête
```html
<div class="session-header" id="sessionMeta">
  <div class="group-badge group-color-1">
    <span class="group-badge-icon">👥</span>
    <span>Groupe 1</span>
  </div>
  <div class="session-info">Code: ABCD | Alice</div>
</div>
```

#### Lobby
```html
<div class="list-item">
  <span>
    Alice
    <span style="opacity: 0.6;">(vous)</span>
  </span>
  <span class="group-badge group-color-1">
    👥 Groupe 1
  </span>
</div>
```

### CSS

```css
.session-header {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  gap: 8px;
  align-items: center;
  z-index: 50;
  flex-direction: column;
  align-items: flex-end;
}

.group-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.85rem;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: white;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

/* Group colors */
.group-color-1 { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
.group-color-2 { background: linear-gradient(135deg, #10b981, #14b8a6); }
/* ... etc */
```

### JavaScript

```javascript
// Dans render()
const myGroup = s.groups.find(g => g.players.some(p => p.id === state.playerId));

if (me && myGroup) {
  const groupColorClass = `group-color-${((myGroup.idx - 1) % 6) + 1}`;
  $('sessionMeta').innerHTML = `
    <div class="group-badge ${groupColorClass}">
      <span class="group-badge-icon">👥</span>
      <span>Groupe ${myGroup.idx}</span>
    </div>
    <div class="session-info">Code: ${s.code} | ${me.nickname}</div>
  `;
}

// Dans renderLobby()
const groupIdx = getGroupIdx(s, p.groupId);
const groupColorClass = `group-color-${((groupIdx - 1) % 6) + 1}`;
```

## Avantages UX

✅ **Identification immédiate**: Le joueur voit son groupe en permanence  
✅ **Différenciation visuelle**: Les couleurs permettent de distinguer rapidement les groupes  
✅ **Cohérence**: Même couleur dans l'en-tête et le lobby  
✅ **Accessibilité**: Contraste élevé (texte blanc sur fond coloré)  
✅ **Mobile-friendly**: Badge compact et lisible sur petit écran  

## Cas d'Usage

- **Grandes parties**: Avec 3-6 groupes, les couleurs aident à s'y retrouver
- **Phase 1**: Savoir rapidement qui est dans votre groupe
- **Phase 2**: Se rappeler de quel groupe viennent les narrateurs
- **Organisation**: Les organisateurs voient facilement la répartition

## Améliorations Futures

- [ ] Afficher les couleurs de groupe dans les scores
- [ ] Ajouter des icônes personnalisées par groupe (au lieu de 👥)
- [ ] Permettre à l'hôte de personnaliser les couleurs
- [ ] Afficher le nom du groupe (ex: "Équipe Rouge") au lieu de "Groupe 1"
- [ ] Animer le badge lors du changement de groupe

