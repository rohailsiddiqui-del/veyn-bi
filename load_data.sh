#!/bin/bash
# Login and get token
cat > /tmp/login.json << 'JSONEOF'
{"email":"admin@logoshoes.com","password":"test1234"}
JSONEOF

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d @/tmp/login.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('token','NO_TOKEN'))")

echo "Token obtained: ${TOKEN:0:20}..."

# Upload eval CSV
echo "=== Uploading eval + transcript CSVs ==="
curl -s -X POST http://localhost:4000/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "batchName=Logo Shoes June 2026" \
  -F "eval=@/home/simplyrms/veyn-bi/data/eval.csv" \
  -F "trans=@/home/simplyrms/veyn-bi/data/trans.csv"

echo ""
echo "Waiting for ingestion..."
sleep 5

# Check batch status
echo "=== Batch status ==="
curl -s http://localhost:4000/api/upload/batches \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; rows=json.load(sys.stdin); [print(r['batch_name'], r['status'], r['total_calls'], 'calls') for r in rows]"

echo ""
echo "=== Summary ==="
curl -s http://localhost:4000/api/analytics/summary \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== Agents ==="
curl -s http://localhost:4000/api/analytics/agents \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "LOAD_DONE"
