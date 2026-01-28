# Estado Fase 1 - Checklist

## ✅ Completado

### Core Functionality
- [x] Webhook handler con validación de signature
- [x] Carga de configuración desde `.pr-sheriff.yml` (desde branch base)
- [x] Asignación automática de reviewers (round-robin, random, least-busy)
- [x] Filtrado de eventos para evitar loops infinitos
- [x] Protección contra re-asignaciones innecesarias
- [x] Integración con Slack (cliente básico)

### Configuración
- [x] Sistema de configuración global (env vars)
- [x] Sistema de configuración por repositorio (YAML)
- [x] Validación con Zod schemas
- [x] Soporte para private key desde path o contenido directo

### Seguridad
- [x] Validación de webhook signature (HMAC SHA256)
- [x] Filtrado de eventos de bots (evita loops)
- [x] Idempotencia en asignación de reviewers

## ⚠️ Pendiente (Antes de Fase 2)

### Testing
- [ ] **Probar notificaciones de Slack** (canal y formato)
- [ ] Verificar que el mensaje se envía correctamente
- [ ] Verificar formato del mensaje (reviewers, labels, etc.)

### Correcciones Menores
- [x] Corregir uso de token en Slack API (usar solo Bearer en headers)
- [ ] Verificar formato de channel (name vs ID) - ver nota abajo

### Documentación
- [ ] Documentar formato de channel en `.pr-sheriff.yml`
- [ ] Documentar cómo obtener channel ID de Slack
- [ ] Agregar ejemplos de mensajes de Slack

## 📝 Notas Importantes

### Slack Channel Format

**La API de Slack acepta ambos formatos:**
- `#channel-name` - Nombre del canal (ej: `#integrations`)
- `C1234567890` - Channel ID (ej: `C07QU7B1D46`)

**Recomendación:**
- Usar **channel ID** es más confiable (el nombre puede cambiar)
- Para obtener el channel ID:
  1. Abre Slack en el navegador
  2. Click derecho en el canal → "Ver detalles del canal"
  3. El ID está en la URL o en "Información adicional"

**Configuración actual:**
```yaml
notifications:
  new_pr_notifications:
    channel: "#integrations"  # O usar: "C07QU7B1D46"
```

### Slack User ID para DMs

Los DMs usan **User ID** (no username):
- Formato: `U07QU7B1D46` (empieza con `U`)
- Para obtenerlo: Click derecho en el usuario → "Ver perfil" → ID en la URL

## 🚀 Próximos Pasos (Fase 2)

- [ ] Persistencia (PostgreSQL)
- [ ] Tracking de notificaciones (evitar duplicados)
- [ ] Scheduler para reminders diarios
- [ ] Scheduler para blame de PRs antiguos
- [ ] Tests unitarios e integración
- [ ] Mejorar formato de mensajes de Slack (blocks, attachments)
