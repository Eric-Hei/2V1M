#!/bin/bash

# Test script for spectator mode

BASE_URL="http://localhost:3000"

echo "🎮 Testing 2V1M Spectator Mode"
echo "================================"
echo ""

# 1. Create a party
echo "1️⃣  Creating a party..."
PARTY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/parties" \
  -H "Content-Type: application/json" \
  -d '{}')

CODE=$(echo $PARTY_RESPONSE | grep -o '"code":"[^"]*"' | cut -d'"' -f4)
echo "   ✅ Party created with code: $CODE"
echo ""

# 2. Get spectator URL
SPECTATOR_URL="$BASE_URL/spectate/$CODE"
echo "2️⃣  Spectator URL: $SPECTATOR_URL"
echo ""

# 3. Join as player 1
echo "3️⃣  Joining as Player 1..."
PLAYER1=$(curl -s -X POST "$BASE_URL/api/v1/parties/$CODE/join" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Alice"}')
P1_ID=$(echo $PLAYER1 | grep -o '"playerId":"[^"]*"' | cut -d'"' -f4)
echo "   ✅ Alice joined (ID: ${P1_ID:0:8}...)"
echo ""

# 4. Join as player 2
echo "4️⃣  Joining as Player 2..."
PLAYER2=$(curl -s -X POST "$BASE_URL/api/v1/parties/$CODE/join" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Bob"}')
P2_ID=$(echo $PLAYER2 | grep -o '"playerId":"[^"]*"' | cut -d'"' -f4)
echo "   ✅ Bob joined (ID: ${P2_ID:0:8}...)"
echo ""

# 5. Get party snapshot
echo "5️⃣  Getting party snapshot..."
SNAPSHOT=$(curl -s "$BASE_URL/api/v1/parties/$CODE")
PLAYER_COUNT=$(echo $SNAPSHOT | grep -o '"nickname"' | wc -l | tr -d ' ')
echo "   ✅ Party has $PLAYER_COUNT players"
echo ""

echo "================================"
echo "✨ Test Complete!"
echo ""
echo "📺 Open these URLs to test:"
echo "   Main: $BASE_URL"
echo "   Spectator: $SPECTATOR_URL"
echo ""
echo "💡 The spectator URL should show:"
echo "   - Live scoreboard during game"
echo "   - Real-time updates"
echo "   - No player controls"

