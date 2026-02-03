#!/bin/bash

# Script para probar el webhook real de GitHub
# Usa el payload y signature reales del webhook

set -e

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuración
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
ENDPOINT="${SERVER_URL}/webhook/github"
FIXTURE_FILE="tests/fixtures/webhook-real-pull-request-opened.json"

# Verificar que el archivo existe
if [ ! -f "$FIXTURE_FILE" ]; then
  echo -e "${RED}❌ Error: No se encontró el archivo fixture: $FIXTURE_FILE${NC}"
  exit 1
fi

# Leer el payload
PAYLOAD=$(cat "$FIXTURE_FILE")

echo -e "${YELLOW}🚀 Testing webhook endpoint: ${ENDPOINT}${NC}"
echo ""
echo -e "${YELLOW}Payload:${NC}"
echo "$PAYLOAD" | jq '.action, .number, .pull_request.title' 2>/dev/null || echo "PR #1 opened"
echo ""

# Headers del webhook real
SIGNATURE_256="sha256=b63f723de218039063b17b1e599beea8b81db3ffafbfae34d9be70361a2fa2f3"
SIGNATURE_SHA1="sha1=5428a8eda326a88b9a91e2f7293bdbd49a35f67a"
GITHUB_EVENT="pull_request"
GITHUB_DELIVERY="bee616f0-fb24-11f0-8697-ee140f5e4a09"
INSTALLATION_TARGET_TYPE="integration"
INSTALLATION_TARGET_ID="2735844"
HOOK_ID="593485127"

# Hacer el request
echo -e "${YELLOW}Enviando request...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: */*" \
  -H "X-GitHub-Event: $GITHUB_EVENT" \
  -H "X-GitHub-Delivery: $GITHUB_DELIVERY" \
  -H "X-Hub-Signature-256: $SIGNATURE_256" \
  -H "X-Hub-Signature: $SIGNATURE_SHA1" \
  -H "X-GitHub-Hook-Installation-Target-Type: $INSTALLATION_TARGET_TYPE" \
  -H "X-GitHub-Hook-Installation-Target-ID: $INSTALLATION_TARGET_ID" \
  -H "X-GitHub-Hook-ID: $HOOK_ID" \
  -H "User-Agent: GitHub-Hookshot/9b5ad09" \
  -d "$PAYLOAD" \
  "$ENDPOINT")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
echo -e "${YELLOW}Response:${NC}"
echo "HTTP Status: $HTTP_CODE"
echo "Body: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Webhook recibido correctamente${NC}"
  echo -e "${GREEN}✅ Revisa los logs del servidor para ver el procesamiento${NC}"
else
  echo -e "${RED}❌ Error: HTTP Status $HTTP_CODE${NC}"
  if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${YELLOW}⚠️  El signature no coincide. Verifica GITHUB_WEBHOOK_SECRET en tu .env${NC}"
  fi
fi
