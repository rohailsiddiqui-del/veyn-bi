#!/bin/bash
# Write test JSON
cat > /tmp/reg.json << 'JSONEOF'
{"tenantName":"Logo Shoes","industry":"retail","email":"admin@logoshoes.com","password":"test1234"}
JSONEOF

echo "=== Register tenant ==="
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d @/tmp/reg.json

echo ""
echo "=== Login ==="
cat > /tmp/login.json << 'JSONEOF'
{"email":"admin@logoshoes.com","password":"test1234"}
JSONEOF

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d @/tmp/login.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('token','NO_TOKEN'))")

echo "Token: $TOKEN"

echo ""
echo "=== Analytics summary (no data yet) ==="
curl -s http://localhost:4000/api/analytics/summary \
  -H "Authorization: Bearer $TOKEN"
echo ""
echo "TESTS_DONE"
