# Tests Unitarios

## Ejecutar Tests

```bash
# Ejecutar todos los tests
npm test

# Ejecutar en modo watch
npm run test:watch

# Ejecutar con cobertura
npm test -- --coverage

# Ejecutar un archivo específico
npm test tests/unit/strategies/random.test.ts
```

## Estructura de Tests

### Tests Creados

#### Assignment Engine (5 archivos)
- `tests/unit/strategies/round-robin.test.ts` - Estrategia round-robin
- `tests/unit/strategies/random.test.ts` - Estrategia random
- `tests/unit/strategies/least-busy.test.ts` - Estrategia least-busy
- `tests/unit/assignment/engine.test.ts` - Motor de asignación
- `tests/unit/assignment/persistence.test.ts` - Persistencia de asignaciones

#### Notifications (4 archivos)
- `tests/unit/notifications/messages.test.ts` - Formatters de mensajes
- `tests/unit/notifications/tracker.test.ts` - Tracking de notificaciones
- `tests/unit/notifications/engine.test.ts` - Motor de notificaciones
- `tests/unit/notifications/slack-client.test.ts` - Cliente de Slack

#### GitHub Integration (2 archivos)
- `tests/unit/github/validator.test.ts` - Validación de webhooks
- `tests/unit/github/auth.test.ts` - Autenticación y JWT

#### Config (2 archivos)
- `tests/unit/config/global.test.ts` - Configuración global
- `tests/unit/config/repository.test.ts` - Configuración de repositorio

## Cobertura

Ejecuta con cobertura para ver el porcentaje:

```bash
npm test -- --coverage
```

La cobertura estimada es de **~70-80%** del código crítico y de media prioridad.

## Notas

- Los tests usan mocks para evitar llamadas reales a APIs externas
- Los tests de integración (webhooks, jobs) están pendientes
- Algunos archivos (handler, events) son mejor testeados con tests de integración
