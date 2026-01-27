#!/bin/bash

# Script para generar el signature correcto con tu secret local
# Esto te permite probar con el payload real pero usando tu secret

set -e

PAYLOAD_FILE="${1:-tests/fixtures/webhook-real-pull-request-opened.json}"

# Intentar leer el secret del .env si existe
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep GITHUB_WEBHOOK_SECRET | xargs)
fi

SECRET="${GITHUB_WEBHOOK_SECRET:-your-webhook-secret}"

if [ ! -f "$PAYLOAD_FILE" ]; then
  echo "❌ Error: No se encontró el archivo: $PAYLOAD_FILE"
  exit 1
fi

PAYLOAD=$(cat "$PAYLOAD_FILE")

# Calcular signature con tu secret
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
SIGNATURE_HEADER="sha256=$SIGNATURE"

echo "📝 Signature generado con tu secret local:"
echo "$SIGNATURE_HEADER"
echo ""
echo "🚀 Comando curl completo:"
echo ""
echo "curl -X POST http://localhost:3000/webhook/github \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"Accept: */*\" \\"
echo "  -H \"X-GitHub-Event: pull_request\" \\"
echo "  -H \"X-GitHub-Delivery: bee616f0-fb24-11f0-8697-ee140f5e4a09\" \\"
echo "  -H \"X-Hub-Signature-256: $SIGNATURE_HEADER\" \\"
echo "  -H \"X-GitHub-Hook-Installation-Target-Type: integration\" \\"
echo "  -H \"X-GitHub-Hook-Installation-Target-ID: 2735844\" \\"
echo "  -H \"X-GitHub-Hook-ID: 593485127\" \\"
echo "  -H \"User-Agent: GitHub-Hookshot/9b5ad09\" \\"
echo "  -d @$PAYLOAD_FILE"
