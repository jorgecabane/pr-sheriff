# Testing Reminders y Blame

## Pruebas de Mensajes

### 1. Probar Reminders (DMs)

Los reminders se envían como mensajes directos a cada reviewer con sus PRs pendientes.

**Comando:**
```bash
npm run test:reminders <slack_user_id>
```

**Ejemplo:**
```bash
npm run test:reminders U07QU7B1D46
```

**O directamente:**
```bash
tsx scripts/test-reminders.ts U07QU7B1D46
```

**Qué hace:**
- Envía un mensaje directo al usuario especificado
- Muestra PRs de ejemplo con formato mejorado (Slack Blocks)
- Incluye botones para ver cada PR

---

### 2. Probar Blame (Canal)

Los mensajes de blame se envían al canal configurado con PRs antiguos.

**Comando:**
```bash
npm run test:blame <channel_id>
```

**Ejemplo:**
```bash
npm run test:blame C0ABFQMFQA0
```

**O directamente:**
```bash
tsx scripts/test-blame.ts C0ABFQMFQA0
```

**Qué hace:**
- Envía un mensaje al canal especificado
- Muestra PRs de ejemplo con más de X días abiertos
- Incluye menciones a los revisores asignados
- Usa botones rojos para indicar urgencia

---

## Mejoras Implementadas

### Formato de Reminders
- ✅ Slack Blocks con formato visual
- ✅ Header con emoji y cantidad de PRs
- ✅ Información compacta por PR (título, autor, labels)
- ✅ Botones "Ver PR" para cada PR
- ✅ Dividers entre PRs para mejor legibilidad

### Formato de Blame
- ✅ Slack Blocks con formato visual
- ✅ Header con advertencia y días
- ✅ Context con cantidad de PRs encontrados
- ✅ Menciones a revisores (Slack user IDs)
- ✅ Botones rojos para indicar urgencia
- ✅ Información completa por PR

---

## Notas

- Los scripts usan PRs de ejemplo para testing
- Asegúrate de tener `SLACK_BOT_TOKEN` configurado en `.env`
- El bot debe tener permisos para enviar DMs y mensajes al canal
- Los Slack User IDs empiezan con `U` (ej: `U07QU7B1D46`)
- Los Channel IDs empiezan con `C` (ej: `C0ABFQMFQA0`)

---

## Próximos Pasos (Fase 2)

- [ ] Implementar scheduler real (cron jobs)
- [ ] Consultar PRs reales desde GitHub API
- [ ] Filtrar PRs por estado (abierto, sin review, etc.)
- [ ] Calcular días desde creación
- [ ] Agrupar PRs por reviewer para reminders
