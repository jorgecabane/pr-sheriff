#!/bin/bash

# Comando curl completo para probar el webhook real de GitHub
# Copia y pega este comando en tu terminal

curl -X POST http://localhost:3000/webhook/github \
  -H "Content-Type: application/json" \
  -H "Accept: */*" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: bee616f0-fb24-11f0-8697-ee140f5e4a09" \
  -H "X-Hub-Signature-256: sha256=b63f723de218039063b17b1e599beea8b81db3ffafbfae34d9be70361a2fa2f3" \
  -H "X-Hub-Signature: sha1=5428a8eda326a88b9a91e2f7293bdbd49a35f67a" \
  -H "X-GitHub-Hook-Installation-Target-Type: integration" \
  -H "X-GitHub-Hook-Installation-Target-ID: 2735844" \
  -H "X-GitHub-Hook-ID: 593485127" \
  -H "User-Agent: GitHub-Hookshot/9b5ad09" \
  -d @tests/fixtures/webhook-real-pull-request-opened.json
