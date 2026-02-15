import 'dotenv/config';
import { Redis } from '@upstash/redis';

console.log('🧪 Testing Upstash Redis connection...\n');

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

console.log('URL:', url ? '✅ Set' : '❌ Missing');
console.log('Token:', token ? '✅ Set' : '❌ Missing');
console.log('');

if (!url || !token) {
  console.error('❌ Missing Redis credentials in .env file');
  process.exit(1);
}

const redis = new Redis({ url, token });

try {
  // Test 1: Set a value
  console.log('📝 Test 1: Setting a test value...');
  await redis.set('test:hello', 'world', { ex: 60 });
  console.log('✅ Value set successfully\n');

  // Test 2: Get the value
  console.log('📖 Test 2: Getting the test value...');
  const value = await redis.get('test:hello');
  console.log('✅ Value retrieved:', value);
  console.log('');

  // Test 3: Set a JSON object
  console.log('📝 Test 3: Setting a JSON object...');
  const party = {
    code: 'TEST123',
    players: ['Alice', 'Bob'],
    createdAt: new Date().toISOString(),
  };
  await redis.set('test:party', JSON.stringify(party), { ex: 60 });
  console.log('✅ JSON object set successfully\n');

  // Test 4: Get the JSON object
  console.log('📖 Test 4: Getting the JSON object...');
  const partyData = await redis.get('test:party');
  // Upstash Redis auto-parses JSON, so partyData is already an object
  const parsedParty = typeof partyData === 'string' ? JSON.parse(partyData) : partyData;
  console.log('✅ JSON object retrieved:', parsedParty);
  console.log('');

  // Test 5: Check if key exists
  console.log('🔍 Test 5: Checking if key exists...');
  const exists = await redis.exists('test:party');
  console.log('✅ Key exists:', exists === 1);
  console.log('');

  // Test 6: Delete the test keys
  console.log('🗑️  Test 6: Cleaning up test keys...');
  await redis.del('test:hello', 'test:party');
  console.log('✅ Test keys deleted\n');

  console.log('🎉 All tests passed! Redis is working correctly.');
  console.log('');
  console.log('✅ You can now use Redis with 2V1M!');

} catch (error) {
  console.error('❌ Redis test failed:', error.message);
  console.error('');
  console.error('Full error:', error);
  process.exit(1);
}

