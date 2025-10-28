#!/bin/bash

# .env 파일에서 환경 변수 로드
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# AppKey 확인
if [ -z "$GSLB_APP_KEY" ]; then
    echo "Error: GSLB_APP_KEY is not set in .env file"
    exit 1
fi

echo "Testing NHN Cloud DNS Plus GSLB API..."
echo "API URL: $GSLB_API_URL"
echo "AppKey: ${GSLB_APP_KEY:0:10}..." # 처음 10자만 표시
echo ""

# GSLB 풀 목록 조회
echo "=== Testing GET /gslbs ==="
curl -X GET "${GSLB_API_URL}/dnsplus/v1.0/appkeys/${GSLB_APP_KEY}/gslbs" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  2>/dev/null | jq '.' || echo "Response (raw):"

echo ""
echo "=== Testing Backend API ==="
curl -X GET "http://localhost:8080/api/gslb/pools" \
  -w "\nHTTP Status: %{http_code}\n" \
  2>/dev/null | jq '.' || echo "Backend not running or error"
