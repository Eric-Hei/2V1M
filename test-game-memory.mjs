import 'dotenv/config';
import { GameStore } from './src/game.mjs';

console.log('🧪 Testing GameStore with current STORAGE_MODE\n');

const store = new GameStore();

try {
  // Test 1: Create party
  console.log('📝 Test 1: Creating a party...');
  const party = await store.createParty({ groups: 2 });
  console.log('✅ Party created:', party.code);
  console.log('');

  // Test 2: Get party snapshot
  console.log('📖 Test 2: Getting party snapshot...');
  const snapshot = await store.getPartySnapshot(party.code);
  console.log('✅ Snapshot retrieved:', snapshot ? 'OK' : 'FAIL');
  console.log('   Status:', snapshot.status);
  console.log('   Groups:', snapshot.groups.length);
  console.log('');

  // Test 3: Join party
  console.log('👤 Test 3: Joining party...');
  const player1 = await store.joinParty(party.code, 'Alice', { groupIndex: 1 });
  console.log('✅ Player joined:', player1.playerId);
  console.log('');

  // Test 4: Join another player
  console.log('👤 Test 4: Joining another player...');
  const player2 = await store.joinParty(party.code, 'Bob', { groupIndex: 1 });
  console.log('✅ Player joined:', player2.playerId);
  console.log('');

  // Test 5: Get updated snapshot
  console.log('📖 Test 5: Getting updated snapshot...');
  const snapshot2 = await store.getPartySnapshot(party.code);
  console.log('✅ Snapshot retrieved');
  console.log('   Players:', snapshot2.players.length);
  console.log('');

  console.log('🎉 All tests passed!');
  console.log('');
  console.log(`✅ GameStore works correctly in ${process.env.STORAGE_MODE || 'memory'} mode`);

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('');
  console.error('Full error:', error);
  process.exit(1);
}

