#!/bin/bash

# Test script for group badges

BASE_URL="http://localhost:3000"

echo "🎨 Testing 2V1M Group Badges"
echo "================================"
echo ""

# 1. Create a party
echo "1️⃣  Creating a party..."
PARTY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/parties" \
  -H "Content-Type: application/json" \
  -d '{"groups": 3}')

CODE=$(echo $PARTY_RESPONSE | grep -o '"code":"[^"]*"' | cut -d'"' -f4)
echo "   ✅ Party created with code: $CODE"
echo ""

# 2. Join as 6 players in different groups
echo "2️⃣  Adding 6 players to 3 groups..."

PLAYERS=("Alice" "Bob" "Charlie" "Diana" "Eve" "Frank")
GROUP_IDS=()

for i in {0..5}; do
  PLAYER_NAME="${PLAYERS[$i]}"
  GROUP_IDX=$((i % 3 + 1))
  
  # Get group ID for this group index
  if [ ${#GROUP_IDS[@]} -lt $GROUP_IDX ]; then
    # Create new group
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/parties/$CODE/join" \
      -H "Content-Type: application/json" \
      -d "{\"nickname\":\"$PLAYER_NAME\",\"createGroup\":true}")
    GROUP_ID=$(echo     GROUP_| grep -o '"groupId":"[^"]*"' | cut    GROUP_ID=$(echo     GROUP_|ROU    GROUP_ID=$(echo     GROUP_| grep j    GROUP_ID=$(echo     GROUP_| grep - else
    # Join existing group
    GROUP_ID="${GROUP_IDS[$((GROUP_    GROUP_ID="${GROUP_IDS[$((GROUP_    GROUP_ID="${GROUP_IDSCO    GROUP_ID="${GROUP_IDS[$((GROUP_   lication/json" \
      -d "{\"nickname\":\"$PLAYER_NAME\",\"groupIndex\":$GROUP_IDX}" > /dev/null
    echo "   ✅ $PLAYER_NAME joined Groupe $GROUP_IDX"
  fi
done

echo ""
echo "================================"
echo "✨ Test Complete!"
echo ""
echo "🎨 Open this URL to see group badges:"
echo "   http://localhost:3000/join/$CODE"
echo ""
echo "💡 You should see:"
echo "   - Badge 'Groupe X' in top-right corner"
echo "   - Colored badges in lobby player list"
echo "   - 3 different colors for 3 groups"
echo "   - '(vous)' next to your name"
