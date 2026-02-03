# Setup de Base de Datos

## Requisitos

- PostgreSQL 12+ (local o servicio en la nube)
- Node.js 18+

**Opciones de PostgreSQL:**
- **Local**: Instalar PostgreSQL en tu máquina
- **Cloud (Recomendado)**: Usar Supabase, Neon, Railway, etc. (ver `docs/DATABASE_PROVIDERS.md`)

## Instalación

### 1. Crear Base de Datos

**Opción A: PostgreSQL Local**
```bash
# Conectarse a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE pr_sheriff;

# Crear usuario (opcional)
CREATE USER pr_sheriff_user WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE pr_sheriff TO pr_sheriff_user;
```

**Opción B: Servicio en la Nube (Recomendado)**
- Ver `docs/DATABASE_PROVIDERS.md` para opciones gratuitas (Supabase, Neon, etc.)
- Crear proyecto y copiar el connection string

### 2. Configurar Variables de Entorno

Agregar a tu `.env`:

**Para PostgreSQL Local:**
```bash
DATABASE_URL=postgresql://pr_sheriff_user:tu_password@localhost:5432/pr_sheriff
```

**Para Supabase (Transaction pooler - Recomendado para serverless):**
```bash
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Para Supabase (Direct connection - Para servidores tradicionales):**
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

**Para Neon (ejemplo):**
```bash
DATABASE_URL=postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require
```

**Nota**: Reemplaza `[PASSWORD]`, `[PROJECT_REF]`, etc. con tus valores reales.

### 3. Generar Migrations

```bash
# Generar migrations desde el schema
npm run db:generate
```

Esto creará archivos SQL en `drizzle/` basados en `src/db/schema.ts`.

### 4. Ejecutar Migrations

**Opción A: Usando drizzle-kit push (Recomendado)**
```bash
# Aplicar migrations a la base de datos
npm run db:migrate
```

**Opción B: Ejecutar SQL manualmente (Si push no funciona)**
1. Abre el archivo generado: `drizzle/0000_*.sql`
2. Copia todo el contenido SQL
3. Ejecútalo en tu base de datos:
   - **Supabase**: Ve a SQL Editor → New Query → Pega el SQL → Run
   - **Local**: `psql -U usuario -d pr_sheriff -f drizzle/0000_*.sql`

### 5. Verificar

```bash
# Abrir Drizzle Studio (opcional, para inspeccionar la DB)
npm run db:studio
```

O verificar manualmente:

```bash
psql -U pr_sheriff_user -d pr_sheriff -c "\dt"
```

Deberías ver las tablas:
- `installations`
- `repositories`
- `pull_requests`
- `notifications`
- `assignment_history`

## Modo Stateless (Sin DB)

El sistema puede funcionar sin base de datos:

- Si `DATABASE_URL` no está configurado, el sistema corre en modo stateless
- Las funcionalidades que requieren persistencia estarán deshabilitadas
- El health check mostrará `database: "disabled"`

## Estructura de Tablas

### `installations`
Trackea instalaciones de la GitHub App.

### `repositories`
Repositorios con `.pr-sheriff.yml` configurado.

### `pull_requests`
PRs abiertos y su estado (sincronizado desde GitHub).

### `notifications`
Tracking de notificaciones enviadas (evita duplicados).

### `assignment_history`
Historial de asignaciones para estrategias como round-robin.

## Troubleshooting

### Error: "Database not initialized"
- Verifica que `DATABASE_URL` esté en `.env`
- Verifica que PostgreSQL esté corriendo
- Revisa los logs para errores de conexión

### Error: "relation does not exist"
- Ejecuta migrations: `npm run db:migrate`
- Verifica que la base de datos existe

### Error de conexión
- Verifica que PostgreSQL esté corriendo: `pg_isready`
- Verifica credenciales en `DATABASE_URL`
- Verifica que el usuario tenga permisos
