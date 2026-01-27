#!/bin/bash

# Script para probar el webhook de GitHub localmente
# Uso: ./scripts/test-webhook.sh

set -e

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuración
WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-your-webhook-secret}"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
ENDPOINT="${SERVER_URL}/webhook/github"
FIXTURE_FILE="tests/fixtures/webhook-pull-request-opened.json"

# Verificar que el archivo fixture existe
if [ ! -f "$FIXTURE_FILE" ]; then
  echo "❌ Error: No se encontró el archivo fixture: $FIXTURE_FILE"
  exit 1
fi

# Generar signature (HMAC SHA256)
# GitHub usa el formato: sha256=<hex_digest>
PAYLOAD=$(cat "$FIXTURE_FILE")
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')
SIGNATURE_HEADER="sha256=$SIGNATURE"

echo -e "${YELLOW}Testing webhook endpoint: ${ENDPOINT}${NC}"
echo ""
echo "Payload:"
echo "$PAYLOAD" | jq '.' 2>/dev/null || echo "$PAYLOAD"
echo ""

# Hacer el request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: test-delivery-$(date +%s)" \
  -H "X-Hub-Signature-256: $SIGNATURE_HEADER" \
  -d "$PAYLOAD" \
  "$ENDPOINT")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo -e "${YELLOW}Response:${NC}"
echo "HTTP Status: $HTTP_CODE"
echo "Body: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Webhook recibido correctamente${NC}"
else
  echo -e "${YELLOW}⚠️  HTTP Status: $HTTP_CODE${NC}"
fi
