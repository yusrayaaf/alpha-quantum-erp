#!/usr/bin/env bash
BASE="${1:-https://erp.alpha-01.info}"
echo "=== Health ==="
curl -sf "$BASE/api?r=health" | python3 -m json.tool 2>/dev/null || curl -s "$BASE/api?r=health"
echo ""
echo "=== Login Test ==="
read -rp "Username: " U
read -rsp "Password: " P; echo ""
curl -sf -X POST "$BASE/api?r=auth%2Flogin" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$U\",\"password\":\"$P\"}" | python3 -m json.tool 2>/dev/null || echo "No response"
