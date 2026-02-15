# 🚀 Déploiement sur Netlify avec Redis

## ⚠️ Problème Actuel : Stockage en Mémoire

Le code actuel utilise un stockage **en mémoire** (Maps JavaScript). Cela fonctionne parfaitement en local, mais pose problème sur Netlify :

### Pourquoi ?

Les fonctions Netlify (AWS Lambda) créent **plusieurs instances** en parallèle :
- Instance #1 : Stocke la partie "ABC123"
- Instance #2 : Ne voit PAS la partie "ABC123" (mémoire isolée)
- Résultat : ❌ Erreur "Party not found"

### Solutions

#### Option 1 : Redis Upstash (Recommandé) ✅

Redis permet de **partager l'état** entre toutes les instances Lambda.

**Avantages** :
- ✅ Toutes les instances voient les mêmes données
- ✅ Persistance (survit aux redémarrages)
- ✅ Ultra-rapide (< 5ms)
- ✅ Gratuit jusqu'à 10,000 requêtes/jour

**Configuration** :

1. **Créer un compte Upstash** : https://upstash.com/
2. **Créer une base Redis** (région EU ou US selon préférence)
3. **Copier les credentials** :
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

4. **Configurer Netlify** :
   ```bash
   netlify env:set STORAGE_MODE "redis"
   netlify env:set UPSTASH_REDIS_REST_URL "https://your-redis.upstash.io"
   netlify env:set UPSTASH_REDIS_REST_TOKEN "your-token-here"
   ```

   Ou via l'interface Netlify :
   - Aller sur https://app.netlify.com/projects/2v1m
   - Site settings → Environment variables
   - Ajouter les 3 variables

5. **Redéployer** :
   ```bash
   netlify deploy --prod
   ```

#### Option 2 : Accepter les Limitations (Démo uniquement) ⚠️

Pour des tests ou démos avec peu d'utilisateurs, tu peux garder le stockage en mémoire.

**Limitations** :
- ❌ Peut casser avec plusieurs joueurs simultanés
- ❌ Parties perdues après 15 min d'inactivité
- ❌ Parties perdues à chaque déploiement
- ✅ Fonctionne pour des tests rapides

## 📋 État Actuel du Déploiement

### ✅ Déjà Configuré

- `netlify.toml` : Configuration build et redirections
- `netlify/functions/server.mjs` : Fonction serverless pour l'API
- Site créé : https://2v1m.netlify.app
- Déploiement fonctionnel

### ⏳ À Faire pour Production

- [ ] Configurer Redis Upstash
- [ ] Ajouter variables d'environnement sur Netlify
- [ ] Migrer `GameStore` pour utiliser Redis (code async)
- [ ] Tester avec plusieurs joueurs simultanés

## 🧪 Test Local avec Redis

### Configuration du Mode de Stockage

Le projet permet de choisir entre stockage en mémoire ou Redis via une variable d'environnement.

**Fichier `.env`** :
```env
# Choisir le mode de stockage
STORAGE_MODE="memory"  # ou "redis"

# Credentials Redis (requis seulement si STORAGE_MODE="redis")
UPSTASH_REDIS_REST_URL="https://supreme-finch-57672.upstash.io"
UPSTASH_REDIS_REST_TOKEN="AeFI..."
```

### Tests

1. **Tester le mode de stockage actuel** :
   ```bash
   node test-storage-mode.mjs
   ```

2. **Tester la connexion Redis** :
   ```bash
   node test-redis.mjs
   ```

3. **Démarrer le serveur** :
   ```bash
   npm start
   ```

Le serveur utilisera automatiquement le mode configuré dans `STORAGE_MODE`.

## 📊 Comparaison

| Aspect | En Mémoire | Redis Upstash |
|--------|------------|---------------|
| **Multi-instances** | ❌ Cassé | ✅ Fonctionne |
| **Persistance** | ❌ Perdu | ✅ Persistant |
| **Performance** | ⚡ Ultra-rapide | ⚡ Très rapide (~5ms) |
| **Coût** | 🆓 Gratuit | 🆓 Gratuit (10k req/jour) |
| **Setup** | ✅ Aucun | ⏱️ 5 minutes |
| **Production** | ❌ Non recommandé | ✅ Production-ready |

## 🔧 Migration vers Redis (TODO)

Pour activer Redis, il faut modifier `src/game.mjs` pour utiliser `src/storage.mjs` :

```javascript
// Actuellement (synchrone)
createParty(opts) {
  const party = { ... };
  this.partiesById.set(partyId, party);
  return party;
}

// Avec Redis (asynchrone)
async createParty(opts) {
  const party = { ... };
  await this.storage.setParty(partyId, party);
  return party;
}
```

**Impact** : Toutes les méthodes deviennent `async`, donc il faut mettre à jour tous les appels dans `src/server.mjs`.

## 📝 Prochaines Étapes

1. **Court terme** : Déployer tel quel pour tester (limitations acceptées)
2. **Moyen terme** : Migrer vers Redis pour production
3. **Long terme** : Ajouter PostgreSQL pour historique des parties

## 🆘 Support

- **Upstash Docs** : https://docs.upstash.com/redis
- **Netlify Env Vars** : https://docs.netlify.com/environment-variables/overview/
- **Netlify Functions** : https://docs.netlify.com/functions/overview/

## ✅ Checklist Déploiement

- [x] Créer compte Netlify
- [x] Créer site `2v1m.netlify.app`
- [x] Configurer `netlify.toml`
- [x] Créer fonction serverless
- [x] Premier déploiement réussi
- [x] Créer compte Upstash
- [x] Tester Redis en local
- [ ] Configurer variables d'environnement Netlify
- [ ] Migrer code vers async/Redis
- [ ] Tester en production
- [ ] Documenter dans README principal

