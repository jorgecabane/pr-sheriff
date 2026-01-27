# Implementación Fase 1 - Stateless

## Estado Actual

✅ **Completado:**

1. **Setup del proyecto**
   - TypeScript con strict mode
   - Fastify como servidor HTTP
   - Pino para logging estructurado
   - Estructura de carpetas modular

2. **Sistema de configuración**
   - Schemas Zod para validación
   - Carga de configuración global (env vars)
   - Carga de configuración por repositorio (`.pr-sheriff.yml`)
   - Validación estricta con fallback seguro

3. **GitHub App Authentication**
   - Generación de JWT desde private key
   - Obtención de installation tokens
   - Caché en memoria de tokens (TTL)

4. **Webhook Handler**
   - Validación de signature (HMAC SHA256)
   - Routing de eventos
   - Procesamiento async (responde rápido)

5. **Assignment Engine**
   - Estrategias: round-robin, random, least-busy
   - Sistema extensible para nuevas estrategias
   - Exclusión de autores configurable

6. **Slack Integration**
   - Cliente con Bot Token
   - Formatters de mensajes
   - Retry con backoff exponencial

7. **Flujo completo implementado**
   - PR opened → Cargar config → Asignar reviewers → Notificar Slack

## Cómo Probar

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crear archivo `.env` (o usar las variables directamente):

```bash
GITHUB_APP_ID=tu_app_id
# Recomendado: ~/.ssh/github-app-key.pem (ver docs/SETUP.md para más opciones)
GITHUB_PRIVATE_KEY_PATH=~/.ssh/github-app-key.pem
GITHUB_WEBHOOK_SECRET=tu_webhook_secret
SLACK_BOT_TOKEN=xoxb-tu-token
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

### 4. Configurar GitHub App

1. Crear una GitHub App en tu organización
2. Configurar webhook URL: `https://tu-servidor.com/webhook/github`
3. Seleccionar eventos: `pull_request`, `pull_request_review`
4. Instalar la app en los repositorios donde quieras usarla

### 5. Configurar repositorio

Crear `.pr-sheriff.yml` en la raíz del repositorio:

```yaml
version: 0.1
team:
  name: "Integrations"
  members:
    - github: "username1"
      slack: "U1234567890"
    - github: "username2"
      slack: "U0987654321"

github:
  auto_assign:
    enabled: true
    reviewers_per_pr: 1
    assignment_strategy: "round-robin"
    exclude_authors: true

notifications:
  new_pr_notifications:
    enabled: true
    channel: "#integrations"
    include_reviewers: true
    include_assignees: true
    include_description: true
    include_labels: true
    include_files_changed: false

rules:
  reviewers_per_pr: 1
  exclude_labels:
    - "draft"
    - "wip"
  include_labels: []
  timezone: "America/Santiago"
```

### 6. Probar

1. Crear un PR en un repositorio configurado
2. El bot debería:
   - Asignar automáticamente un reviewer
   - Enviar notificación a Slack

## Estructura del Proyecto

```
src/
├── config/           # Sistema de configuración
├── github/           # GitHub App auth y webhooks
├── assignment/       # Motor de asignación de revisores
├── notifications/    # Integración con Slack
├── utils/            # Utilidades (logger, etc.)
├── server.ts         # Setup de Fastify
└── index.ts          # Entry point
```

## Próximos Pasos (Fase 2)

- [ ] Agregar persistencia (PostgreSQL)
- [ ] Tracking de notificaciones (evitar duplicados)
- [ ] Scheduler para reminders diarios
- [ ] Scheduler para blame de PRs antiguos
- [ ] Tests unitarios e integración
- [ ] Documentación completa

## Notas

- **Stateless**: No hay base de datos, todo en memoria
- **Idempotencia**: Operaciones son idempotentes por diseño
- **Caché**: Installation tokens se cachean en memoria
- **Retry**: Slack notifications tienen retry automático
- **Logging**: Logs estructurados en JSON (desarrollo: pretty print)
