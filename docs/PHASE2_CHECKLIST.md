# Fase 2 - Checklist Detallado

## 🎯 Objetivo
Agregar persistencia, schedulers y tracking para hacer el sistema stateful y completo.

---

## 📋 Tareas

### 1. Persistencia (PostgreSQL)
- [ ] **1.1 Setup de base de datos**
  - [ ] Elegir ORM/query builder (recomendado: Drizzle ORM o Prisma)
  - [ ] Configurar conexión a PostgreSQL
  - [ ] Variables de entorno para DB connection string
  - [ ] Migrations setup

- [ ] **1.2 Schema de base de datos**
  - [ ] Tabla `installations` (GitHub App installations)
  - [ ] Tabla `repositories` (repos con `.pr-sheriff.yml`)
  - [ ] Tabla `pull_requests` (tracking de PRs)
  - [ ] Tabla `notifications` (tracking de notificaciones enviadas)
  - [ ] Tabla `assignment_history` (historial de asignaciones para round-robin)

- [ ] **1.3 Database client/abstracción**
  - [ ] Crear `src/db/client.ts`
  - [ ] Crear `src/db/migrations/`
  - [ ] Crear `src/db/schema.ts`
  - [ ] Integrar con el servidor (inicialización)

---

### 2. Tracking de Notificaciones
- [ ] **2.1 Modelo de datos**
  - [ ] Schema para `notifications` table
  - [ ] Campos: `id`, `type`, `recipient`, `pr_id`, `sent_at`, `delivery_id`

- [ ] **2.2 Servicio de tracking**
  - [ ] Crear `src/notifications/tracker.ts`
  - [ ] Método para registrar notificación enviada
  - [ ] Método para verificar si ya se envió (idempotencia)
  - [ ] Integrar con `NotificationEngine`

- [ ] **2.3 Prevenir duplicados**
  - [ ] Verificar antes de enviar notificación de nuevo PR
  - [ ] Usar `delivery_id` del webhook como key
  - [ ] Manejar casos edge (webhooks duplicados)

---

### 3. Scheduler para Reminders Diarios
- [ ] **3.1 Setup de scheduler**
  - [ ] Elegir librería (recomendado: `node-cron` o `croner`)
  - [ ] Crear `src/scheduler/index.ts`
  - [ ] Integrar con servidor (inicialización al startup)

- [ ] **3.2 Job de reminders**
  - [ ] Crear `src/scheduler/jobs/reminders.ts`
  - [ ] Consultar PRs abiertos desde GitHub API
  - [ ] Filtrar PRs por reviewer asignado
  - [ ] Agrupar PRs por reviewer
  - [ ] Enviar DMs usando `formatReminderMessage`
  - [ ] Respetar configuración (hora, días de semana, timezone)

- [ ] **3.3 Lógica de consulta**
  - [ ] Listar installations activas
  - [ ] Para cada installation, listar repos con `.pr-sheriff.yml`
  - [ ] Para cada repo, listar PRs abiertos
  - [ ] Filtrar PRs donde el usuario es reviewer
  - [ ] Excluir PRs con labels de exclusión

---

### 4. Scheduler para Blame (PRs Antiguos)
- [ ] **4.1 Job de blame**
  - [ ] Crear `src/scheduler/jobs/blame.ts`
  - [ ] Consultar PRs abiertos desde GitHub API
  - [ ] Calcular días desde creación
  - [ ] Filtrar PRs con más de X días (configurable)
  - [ ] Agrupar por repositorio/canal
  - [ ] Enviar mensaje usando `formatBlameMessage`
  - [ ] Respetar configuración (hora, frecuencia, timezone)

- [ ] **4.2 Lógica de consulta**
  - [ ] Similar a reminders pero con filtro de días
  - [ ] Considerar timezone del repositorio
  - [ ] Agrupar por canal de Slack configurado

---

### 5. Mejoras en Assignment Engine
- [ ] **5.1 Round-robin con persistencia**
  - [ ] Guardar último reviewer asignado por repo
  - [ ] Leer desde DB en lugar de memoria
  - [ ] Actualizar después de cada asignación

- [ ] **5.2 Least-busy strategy (completar)**
  - [ ] Consultar PRs abiertos por reviewer desde GitHub API
  - [ ] Contar PRs pendientes de revisar
  - [ ] Seleccionar reviewer con menos PRs

---

### 6. Tests
- [ ] **6.1 Tests unitarios**
  - [ ] Tests para assignment strategies
  - [ ] Tests para notification tracker
  - [ ] Tests para scheduler jobs
  - [ ] Tests para formatters de mensajes

- [ ] **6.2 Tests de integración**
  - [ ] Tests end-to-end de webhook → asignación → notificación
  - [ ] Tests de scheduler con mocks
  - [ ] Tests de base de datos (setup/teardown)

---

### 7. Documentación
- [ ] **7.1 Setup de base de datos**
  - [ ] Documentar cómo crear DB
  - [ ] Documentar migrations
  - [ ] Documentar variables de entorno

- [ ] **7.2 Documentación de scheduler**
  - [ ] Cómo funcionan los jobs
  - [ ] Configuración de timezone
  - [ ] Troubleshooting

---

## 🚀 Orden de Implementación Recomendado

1. **Persistencia (1.1, 1.2, 1.3)** - Base para todo lo demás
2. **Tracking de Notificaciones (2.1, 2.2, 2.3)** - Evitar duplicados
3. **Round-robin con persistencia (5.1)** - Mejora inmediata
4. **Scheduler setup (3.1)** - Infraestructura
5. **Reminders job (3.2, 3.3)** - Primera funcionalidad programada
6. **Blame job (4.1, 4.2)** - Segunda funcionalidad programada
7. **Least-busy strategy (5.2)** - Completar estrategia pendiente
8. **Tests (6.1, 6.2)** - Asegurar calidad
9. **Documentación (7.1, 7.2)** - Cerrar fase

---

## 📝 Notas de Diseño

### Principios
- **GitHub es source of truth**: La DB solo trackea estado derivado
- **Idempotencia**: Todas las operaciones deben ser idempotentes
- **Fail-safe**: Si la DB falla, el sistema debe seguir funcionando (degradación)
- **Migrations**: Versionadas y reversibles

### Decisiones Técnicas
- **ORM**: Drizzle ORM (ligero, type-safe, sin runtime overhead)
- **Scheduler**: `croner` (mejor manejo de timezones que node-cron)
- **Connection pooling**: Usar pool de PostgreSQL nativo
- **Migrations**: Drizzle Kit o manual con SQL

---

## ✅ Criterios de Éxito

- [ ] Sistema puede funcionar sin DB (fallback graceful)
- [ ] No se envían notificaciones duplicadas
- [ ] Reminders se envían a la hora configurada
- [ ] Blame se ejecuta según frecuencia configurada
- [ ] Round-robin funciona correctamente con persistencia
- [ ] Tests cubren funcionalidad crítica
- [ ] Documentación completa
