# Guía de Testing

## Probar el Webhook de GitHub

Hay dos formas de probar:

1. **Ejecutar las acciones directamente** (recomendado para probar auto assign + Slack): no requiere servidor, usa las mismas funciones internas que el handler.
2. **Enviar HTTP al endpoint**: requiere servidor levantado; el servidor procesa el evento en background.

### Método 0: Ejecutar acciones del webhook (auto assign + Slack) sin servidor

Llama a `processWebhookEvent` con tu payload; se ejecutan las mismas acciones que en producción (carga `.pr-sheriff.yml`, asigna revisores, notifica a Slack). No duplica código.

```bash
# Con el fixture por defecto
npm run test:webhook:run

# Con tu payload (ej. el que rellenaste en webhook-payload-local.json)
npm run test:webhook:run -- tests/fixtures/webhook-payload-local.json
```

Requiere las mismas variables de entorno que el servidor (`.env`): `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_PATH` o `GITHUB_PRIVATE_KEY_CONTENT`, `SLACK_BOT_TOKEN`, etc. Opcional: `DATABASE_URL` si usas round-robin/least-busy con persistencia.

---

### Endpoint (para prueba vía HTTP)

```
POST http://localhost:3000/webhook/github
```

### Headers Requeridos

GitHub envía estos headers con cada webhook:

- `X-GitHub-Event`: Tipo de evento (ej: `pull_request`)
- `X-GitHub-Delivery`: ID único del delivery
- `X-Hub-Signature-256`: Signature HMAC SHA256 del payload
- `Content-Type`: `application/json`

### Método 1: Script Node.js (Recomendado)

```bash
# Asegúrate de tener el servidor corriendo en otro terminal
npm run dev

# En otro terminal, ejecuta el script de prueba
npm run test:webhook

# O con variables de entorno personalizadas
GITHUB_WEBHOOK_SECRET=tu-secret npm run test:webhook
```

### Método 2: Script Bash

```bash
# Dar permisos de ejecución
chmod +x scripts/test-webhook.sh

# Ejecutar
./scripts/test-webhook.sh
```

### Método 3: cURL Manual (con payload real)

**Opción A: Usar el webhook real de GitHub**

```bash
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
```

**Opción B: Generar signature nuevo (para testing)**

```bash
# Generar signature
PAYLOAD=$(cat tests/fixtures/webhook-pull-request-opened.json)
SECRET="tu-webhook-secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# Hacer request
curl -X POST http://localhost:3000/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: test-$(date +%s)" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d @tests/fixtures/webhook-pull-request-opened.json
```

**Opción C: Script con webhook real**

```bash
# Ejecutar script que usa el payload y signature reales
./scripts/test-webhook-real.sh
```

### Método 4: Usando GitHub Webhook Delivery UI

1. Ve a tu GitHub App settings
2. En "Advanced" → "Webhook deliveries"
3. Puedes re-deliver eventos anteriores o crear nuevos

### Payload de Ejemplo

El archivo `tests/fixtures/webhook-pull-request-opened.json` contiene un ejemplo del payload que GitHub envía cuando se abre un PR.

### Variables de Entorno para Testing

```bash
# Secret del webhook (debe coincidir con GITHUB_WEBHOOK_SECRET en .env)
export GITHUB_WEBHOOK_SECRET=tu-secret

# URL del servidor (default: http://localhost:3000)
export SERVER_URL=http://localhost:3000
```

### Generar Signature Correcto

**⚠️ Importante:** El signature que viene de GitHub fue calculado con el secret de GitHub. Para que funcione, necesitas:

1. **Opción A: Usar el mismo secret que GitHub**
   - El signature que proporcionaste solo funcionará si tu `GITHUB_WEBHOOK_SECRET` es el mismo que GitHub usó

2. **Opción B: Generar nuevo signature con tu secret local (Recomendado)**
   ```bash
   # Generar signature con tu secret del .env
   ./scripts/generate-signature.sh
   
   # Esto te dará el comando curl completo con el signature correcto
   ```

### Verificar que Funciona

1. **Servidor debe estar corriendo**: `npm run dev`
2. **Generar signature correcto**: `./scripts/generate-signature.sh`
3. **Ejecutar el comando curl** que te muestra el script
4. **Verificar logs**: Deberías ver en los logs del servidor:
   - `Received webhook`
   - `Processing webhook event`
   - `Handling pull_request.opened event`

### Troubleshooting

**Error 401 (Invalid signature)**
- Verifica que `GITHUB_WEBHOOK_SECRET` coincida con el secret configurado
- El signature debe ser `sha256=<hex_digest>`

**Error de conexión**
- Verifica que el servidor esté corriendo en el puerto correcto
- Verifica que `SERVER_URL` apunte al servidor correcto

**No se procesa el evento**
- Verifica los logs del servidor para ver errores
- Verifica que el payload tenga la estructura correcta
- Verifica que `action === "opened"` en el payload
