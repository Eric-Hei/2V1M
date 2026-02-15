import { Redis } from '@upstash/redis';

// Configuration du mode de stockage
const STORAGE_MODE = process.env.STORAGE_MODE || 'memory';
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis = null;

/**
 * Initialise et retourne l'instance Redis
 * Retourne null si STORAGE_MODE="memory" ou si les credentials manquent
 */
export function getRedis() {
  // Si le mode est explicitement "memory", ne pas utiliser Redis
  if (STORAGE_MODE === 'memory') {
    console.log('📦 Storage mode: IN-MEMORY (configured via STORAGE_MODE)');
    return null;
  }

  // Si le mode est "redis", vérifier les credentials
  if (STORAGE_MODE === 'redis') {
    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
      console.error('❌ STORAGE_MODE="redis" but Redis credentials are missing!');
      console.error('   Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
      console.error('   Falling back to in-memory storage...');
      return null;
    }

    if (!redis) {
      redis = new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      });
      console.log('✅ Storage mode: REDIS (Upstash)');
    }

    return redis;
  }

  // Mode inconnu
  console.warn(`⚠️  Unknown STORAGE_MODE="${STORAGE_MODE}". Valid values: "memory" or "redis"`);
  console.warn('   Falling back to in-memory storage...');
  return null;
}

/**
 * Helper pour vérifier si Redis est activé et disponible
 */
export function isRedisAvailable() {
  return STORAGE_MODE === 'redis' && UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN;
}

/**
 * Retourne le mode de stockage actuel
 */
export function getStorageMode() {
  return isRedisAvailable() ? 'redis' : 'memory';
}

