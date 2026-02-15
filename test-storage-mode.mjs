import 'dotenv/config';
import { getRedis, isRedisAvailable, getStorageMode } from './src/redis.mjs';

console.log('🧪 Testing Storage Mode Configuration\n');

console.log('Environment Variables:');
console.log('  STORAGE_MODE:', process.env.STORAGE_MODE || '(not set, defaults to "memory")');
console.log('  UPSTASH_REDIS_REST_URL:', process.env.UPSTASH_REDIS_REST_URL ? '✅ Set' : '❌ Not set');
console.log('  UPSTASH_REDIS_REST_TOKEN:', process.env.UPSTASH_REDIS_REST_TOKEN ? '✅ Set' : '❌ Not set');
console.log('');

console.log('Storage Configuration:');
const redis = getRedis();
console.log('  Redis instance:', redis ? '✅ Created' : '❌ Null (using memory)');
console.log('  Redis available:', isRedisAvailable() ? '✅ Yes' : '❌ No');
console.log('  Active storage mode:', getStorageMode());
console.log('');

if (redis) {
  console.log('✅ Redis mode is active!');
  console.log('   All game data will be stored in Upstash Redis.');
  console.log('   Data persists across restarts and is shared between instances.');
} else {
  console.log('📦 In-memory mode is active!');
  console.log('   All game data is stored in JavaScript Maps.');
  console.log('   Data is lost on restart and not shared between instances.');
}

console.log('');
console.log('💡 To switch modes, edit .env:');
console.log('   STORAGE_MODE="memory"  → In-memory storage');
console.log('   STORAGE_MODE="redis"   → Redis storage');

