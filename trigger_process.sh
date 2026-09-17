#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@logoshoes.com","password":"test123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

echo "Got token: ${TOKEN:0:20}..."

RESULT=$(curl -s -X POST http://localhost:4000/api/insights/process \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json')

echo "Process result: $RESULT"
