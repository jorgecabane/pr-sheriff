# Proveedores de PostgreSQL Gratuitos

## Opciones Recomendadas

### 1. **Supabase** (Recomendado) ⭐
- **URL**: https://supabase.com
- **Plan gratuito**: 
  - 500 MB de base de datos
  - 2 GB de bandwidth
  - Sin límite de tiempo
- **Ventajas**:
  - Muy fácil de usar
  - Dashboard web incluido
  - Connection pooling automático
  - Backups automáticos
  - API REST incluida (no necesaria para nuestro caso)
- **Cómo obtener connection string**:
  1. Crear cuenta en supabase.com
  2. Crear nuevo proyecto
  3. Settings → Database → Connection string
  4. **Elegir opción según tu deployment:**
     - **Transaction pooler** (Recomendado para serverless/Vercel): Ideal para aplicaciones stateless donde cada interacción es breve
     - **Direct connection**: Solo si tu servidor corre en un VM/contenedor de larga duración
     - **Session pooler**: Solo si necesitas IPv4 (generalmente no necesario)

**Connection string ejemplo (Transaction pooler):**
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Connection string ejemplo (Direct connection):**
```
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

**Recomendación**: Usa **Transaction pooler** si vas a deployar en Vercel/serverless, o **Direct connection** si es un servidor tradicional.

---

### 2. **Neon** (Serverless PostgreSQL)
- **URL**: https://neon.tech
- **Plan gratuito**:
  - 0.5 GB de storage
  - Sin límite de tiempo
  - Auto-suspend después de inactividad (se reactiva automáticamente)
- **Ventajas**:
  - Serverless (paga por uso)
  - Branching de bases de datos (útil para testing)
  - Muy rápido
- **Connection string ejemplo:**
```
postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require
```

---

### 3. **Railway**
- **URL**: https://railway.app
- **Plan gratuito**:
  - $5 de crédito gratis/mes
  - PostgreSQL incluido
- **Ventajas**:
  - Muy fácil de deployar
  - Incluye hosting también
  - Buena para proyectos pequeños

---

### 4. **Render**
- **URL**: https://render.com
- **Plan gratuito**:
  - PostgreSQL gratuito (con limitaciones)
  - Se pausa después de 90 días de inactividad
- **Ventajas**:
  - Fácil de usar
  - Incluye hosting

---

### 5. **ElephantSQL**
- **URL**: https://www.elephantsql.com
- **Plan gratuito**:
  - 20 MB de storage
  - 5 conexiones simultáneas
- **Ventajas**:
  - Muy simple
  - Buena para desarrollo/testing

---

## Recomendación para este Proyecto

**Para desarrollo/testing**: **Supabase** o **Neon**
- Fáciles de configurar
- Generosos en el plan gratuito
- Buena documentación

**Para producción**: **Supabase** o **Neon**
- Confiables
- Escalables
- Connection pooling incluido

---

## Configuración Rápida con Supabase

1. **Crear cuenta**: https://supabase.com
2. **Crear proyecto**: New Project → Elegir región
3. **Obtener connection string**:
   - Settings → Database
   - Connection string → Connection pooling (recomendado)
   - Copiar el string
4. **Agregar a `.env`**:
   ```bash
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?pgbouncer=true
   ```
5. **Ejecutar migrations**:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

---

## Notas Importantes

- **Connection pooling**: Usa el connection string con `pgbouncer=true` en Supabase para mejor performance
- **SSL**: La mayoría de servicios requieren SSL (`?sslmode=require`)
- **Variables de entorno**: Nunca commitees el `DATABASE_URL` con la contraseña
- **Backups**: Los servicios gratuitos suelen tener backups automáticos, pero verifica

---

## Comparación Rápida

| Servicio | Storage Gratis | Auto-suspend | Connection Pooling | Recomendado |
|----------|----------------|--------------|-------------------|-------------|
| Supabase | 500 MB | No | ✅ Sí (Transaction/Session pooler) | ⭐⭐⭐⭐⭐ |
| Neon | 0.5 GB | Sí (auto-resume) | ✅ Sí | ⭐⭐⭐⭐⭐ |
| Railway | $5 crédito | No | ⚠️ Manual | ⭐⭐⭐⭐ |
| Render | Limitado | Sí (90 días) | ⚠️ Manual | ⭐⭐⭐ |
| ElephantSQL | 20 MB | No | ❌ No | ⭐⭐ |
