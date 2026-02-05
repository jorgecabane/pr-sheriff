# Migración PR Sheriff a organización Toteat en GCP

Guía paso a paso para traspasar el repositorio, la GitHub App (bot de GitHub) y el backend a la organización **toteat**, con todo el despliegue en **Google Cloud Platform (GCP)**. Slack ya está instalado en el workspace real, por lo que no es necesario migrarlo.

---

## Permisos necesarios

Para poder ejecutar todas las acciones de esta guía, necesitas los siguientes permisos en cada plataforma. Si no los tienes, pide a un admin que te los otorgue o que ejecute los pasos que requieran permisos mayores.

### GitHub (organización toteat)

| Acción | Permiso necesario |
|--------|--------------------|
| Crear / editar GitHub Apps en la org | **Owner** de la organización, o acceso a **Settings → Developer settings**. En orgs, solo los *owners* ven "Developer settings". |
| Instalar la GitHub App en la org o en repos | **Owner** o **Admin** de la organización (quien puede gestionar "Third-party access" e instalaciones). |
| Transferir un repositorio a la org | **Admin** o **Owner** del repositorio de origen y **Owner** en la organización de destino (toteat). |
| Crear un repositorio nuevo en la org | Permiso para **crear repositorios** en la org (normalmente miembros con rol adecuado o **Owner**). |

**Resumen:** Necesitas ser **Owner** de la organización **toteat** (o que un Owner te delegue las tareas) para: crear la GitHub App, instalar la app en la org y transferir o crear el repo.

### Google Cloud Platform (GCP)

Usa un **proyecto** dedicado (ej. `toteat-pr-sheriff`). En ese proyecto necesitas uno de estos perfiles:

| Opción | Rol / Permisos |
|--------|------------------|
| **Recomendada (más simple)** | Rol **Owner** del proyecto (`roles/owner`). Así puedes crear Cloud SQL, Secret Manager, Cloud Run, Cloud Scheduler y cuentas de servicio sin restricciones. |
| **Mínima (por servicio)** | Los siguientes roles en el **mismo proyecto**: |

Desglose por rol si no quieres dar Owner:

| Rol en el proyecto | Para qué lo usas |
|--------------------|-------------------|
| **Cloud SQL Admin** (`roles/cloudsql.admin`) | Crear y configurar la instancia PostgreSQL. |
| **Secret Manager Admin** (`roles/secretmanager.admin`) | Crear y gestionar secrets (o **Secret Manager Secret Accessor** solo para leer; para crear necesitas Admin). |
| **Cloud Run Admin** (`roles/run.admin`) | Desplegar y modificar el servicio Cloud Run. |
| **Cloud Run Invoker** (`roles/run.invoker`) | Si usas Cloud Scheduler para llamar a Cloud Run (o la cuenta de servicio del Scheduler debe tenerlo). |
| **Cloud Scheduler Admin** (`roles/cloudscheduler.admin`) | Crear y editar jobs de Cloud Scheduler. |
| **Service Account User** (`roles/iam.serviceAccountUser`) | Para que Cloud Run use una cuenta de servicio y que Cloud Scheduler invoque Cloud Run. |
| **Storage Admin** o **Artifact Registry Writer** | Si construyes la imagen con Cloud Build y la subes a Artifact Registry / Container Registry. |

**Nota:** Si usas `gcloud run deploy --source .`, Cloud Build se usa por defecto; en muchos proyectos el rol **Owner** o **Editor** ya incluye lo necesario para build y deploy.

### Slack

| Acción | Permiso necesario |
|--------|--------------------|
| Usar el Bot Token en el backend | Tener el **Bot User OAuth Token** (`xoxb-...`) de la app ya instalada. Suele estar en **Slack API** → tu app → **OAuth & Permissions**. Quien instaló la app o un **Admin** del workspace puede verlo. |
| Reinstalar o cambiar la app | **Owner** o **Admin** del workspace de Slack. |

Para esta migración solo hace falta **acceso al token** del bot ya instalado (para ponerlo en GCP Secret Manager); no es obligatorio ser admin del workspace.

**Resumen en una línea:**

| Plataforma | Permiso que necesitas |
|------------|------------------------|
| **GitHub** | Owner de la organización toteat |
| **GCP** | Owner del proyecto (ej. `pr-sheriff` o `toteat-pr-sheriff`) |
| **Slack** | Nada especial; solo tener el Bot Token de la app ya instalada |

---

## Resumen de lo que vamos a hacer

| Paso | Qué | Dónde |
|------|-----|--------|
| 1 | Repositorio Git | Organización toteat en GitHub |
| 2 | GitHub App (bot) | Nueva o existente bajo la org toteat |
| 3 | PostgreSQL | GCP Cloud SQL |
| 4 | Secrets (keys, tokens) | GCP Secret Manager |
| 5 | Backend (API + webhook) | GCP Cloud Run |
| 6 | Cron (reminders, blame) | GCP Cloud Scheduler |
| 7 | Slack | Ya instalado; solo configurar token en secrets |

---

## Parte 1: Repositorio en la organización Toteat

### 1.1 Crear o usar un repo bajo toteat

- **Opción A:** Crear un repo nuevo en la org `toteat` (ej. `toteat/pr-sheriff`) y hacer push del código actual.
- **Opción B:** Transferir el repo existente a la org:  
  **Settings → General → Danger Zone → Transfer ownership** → organización `toteat`.

### 1.2 URLs que necesitarás después

- Repo: `https://github.com/toteat/pr-sheriff` (o el nombre que elijas).
- La GitHub App se instalará en la **organización toteat** (o en repos concretos de la org).

---

## Parte 2: GitHub App en la organización Toteat

La app puede ser **nueva** (recomendado para org) o una existente que quieras usar. Si creas una nueva bajo la org:

### 2.1 Crear la GitHub App (org toteat)

1. Entra en **GitHub** como usuario con permisos de admin en la org.
2. **Organization** → **toteat** → **Settings** → **Developer settings** (o ir a `https://github.com/organizations/toteat/settings/apps`).
3. **GitHub Apps** → **New GitHub App**.
4. Rellena:
   - **Name:** por ejemplo `PR Sheriff` o `pr-sheriff-toteat`.
   - **Homepage URL:** puede ser la del repo, ej. `https://github.com/toteat/pr-sheriff`.
   - **Webhook:**
     - **Active:** sí.
     - **Webhook URL:** lo rellenarás cuando tengas la URL de Cloud Run (ej. `https://pr-sheriff-xxxxx.run.app/webhook/github`). Puedes poner un placeholder y editarlo después.
     - **Webhook secret:** genera uno aleatorio seguro (ej. `openssl rand -hex 32`) y **guárdalo**; lo usarás como `GITHUB_WEBHOOK_SECRET`.
   - **Permissions** (Repository permissions):
     - **Contents:** Read-only (para leer `.pr-sheriff.yml`).
     - **Pull requests:** Read and write (asignar reviewers).
     - **Metadata:** Read-only.
   - **Subscribe to events:** `pull_request`, `pull_request_review`.
5. **Where can this GitHub App be installed?** → **Only on this account** (solo en la org toteat).
6. **Create GitHub App**.

### 2.2 Dónde obtener cada valor

| Variable / Dato | Dónde obtenerla |
|-----------------|------------------|
| **App ID** | En la página de la app: **About** → **App ID** (número). Es tu `GITHUB_APP_ID`. |
| **Installation ID** | Ver sección 2.3. |
| **Private Key** | En la app: **General** → **Private keys** → **Generate a private key**. Descargas un `.pem`. **No** lo subas al repo; lo subirás a GCP Secret Manager. |
| **Webhook secret** | El que definiste al crear la app (o en **Webhook** → **Secret**). Es tu `GITHUB_WEBHOOK_SECRET`. |

### 2.3 Cómo obtener el GitHub Installation ID

El **Installation ID** identifica la instalación de tu app en la org (o en un usuario/repo).

**Opción A – Desde la interfaz (después de instalar):**

1. Instala la app en la org: **Configure** (en la lista de GitHub Apps de la org) o desde la página de la app → **Install App** → elegir **toteat** y repos (All repos o seleccionados).
2. Después de instalar, en la URL verás algo como:  
   `https://github.com/organizations/toteat/settings/installations/12345678`  
   El número **12345678** es el Installation ID.

**Opción B – API (con JWT de la app):**

```bash
# Necesitas un JWT (generado con tu App ID y private key). Ejemplo con curl:
# Primero genera un JWT (puedes usar un script o https://jwt.io con el payload adecuado).
curl -H "Authorization: Bearer TU_JWT" \
  https://api.github.com/app/installations
```

La respuesta incluye `"id": 12345678` para cada instalación.

**Opción C – Sin configurar nada antes:**

Si **no** pones `GITHUB_INSTALLATION_ID` en el entorno, el backend puede funcionar igual: cuando la org (o un repo) reciba el primer webhook (p. ej. al abrir un PR), el payload trae `installation.id`. El backend guarda esa instalación en la base de datos y la usa en los jobs. Para los jobs programados (reminders/blame) hace falta o bien tener ya instalaciones en la DB (por webhooks) o bien definir `GITHUB_INSTALLATION_ID` en GCP.

**Recomendación:** Instala la app en la org toteat, abre la URL de configuración de la instalación y copia el ID. Ponlo en Secret Manager como se indica más abajo (opcional pero útil para jobs).

---

## Parte 3: Proyecto GCP y PostgreSQL

### 3.1 Crear un proyecto dentro de la organización (toteat) en GCP

Si tu cuenta GCP tiene una **organización** (p. ej. un dominio toteat vinculado), conviene crear el proyecto bajo esa org para facturación y permisos centralizados.

**Desde la consola (web):**

1. Entra en [console.cloud.google.com](https://console.cloud.google.com).
2. Abre el selector de proyectos (arriba, junto a "Google Cloud").
3. **New Project**.
4. **Project name:** por ejemplo `pr-sheriff` o `toteat-pr-sheriff`.
5. **Organization:** si ves el desplegable "Organization", elige la org **toteat** (o la que corresponda). Si no tienes org, el proyecto se crea bajo "No organization" (tu cuenta); igualmente válido.
6. **Location:** deja la org o "No organization" según corresponda.
7. **Create**. Anota el **Project ID** (no se puede cambiar después).

**Desde la línea de comandos (`gcloud`):**

```bash
# Listar organizaciones (si tienes)
gcloud organizations list

# Crear proyecto bajo la organización (sustituye ORG_ID por el ID numérico de la org toteat)
gcloud projects create toteat-pr-sheriff --organization=ORG_ID --name="PR Sheriff"

# Si no usas organización, solo:
gcloud projects create toteat-pr-sheriff --name="PR Sheriff"

# Vincular el proyecto a tu cuenta para facturación (si aplica)
gcloud billing accounts list
gcloud billing projects link toteat-pr-sheriff --billing-account=BILLING_ACCOUNT_ID

# Usar este proyecto por defecto
gcloud config set project toteat-pr-sheriff
```

**Permisos:** Para crear un proyecto bajo una organización necesitas el rol **Resource Manager Project Creator** (`roles/resourcemanager.projectCreator`) en la org o en la carpeta donde creas el proyecto. Un **Owner** de la org suele tenerlo.

---

### 3.2 Crear instancia Cloud SQL (PostgreSQL)

1. Activar facturación del proyecto si aún no está activa (Cloud SQL tiene capa gratuita limitada).
2. En la consola: **SQL** en el menú (o buscar “Cloud SQL”) → **Create instance**.
3. Elegir **PostgreSQL**.
4. **Instance ID:** por ejemplo `pr-sheriff-db`.
5. **Password:** definir contraseña para el usuario `postgres` y guardarla en un gestor de contraseñas (la usarás en `DATABASE_URL`).
6. **Region:** la misma que usarás para Cloud Run (ej. `europe-west1`).
7. **Machine type:** para empezar, la más pequeña (ej. shared core).
8. **Storage:** dejar por defecto o ajustar.
9. **Connections:** Public IP y conector Cloud SQL para Cloud Run; o Private IP si tienes VPC.
10. Crear la instancia.

### 3.3 Base de datos y usuario (opcional)

Por defecto existe la base `postgres` y el usuario `postgres`. Puedes usarlos o crear una base y usuario dedicados:

```sql
-- Conectar con Cloud SQL Proxy o desde la consola (Cloud Shell)
CREATE DATABASE pr_sheriff;
-- Opcional: usuario solo para la app
CREATE USER pr_sheriff_app WITH PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE pr_sheriff TO pr_sheriff_app;
```

### 3.4 Connection string

Formato típico (con Cloud SQL Auth Proxy o IP pública y SSL):

```text
postgresql://postgres:PASSWORD@/pr_sheriff?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
```

Para **Cloud Run** con conector de Cloud SQL:

- **Unix socket:** `host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME`.
- Ejemplo de `DATABASE_URL` (usuario `postgres`, base `postgres`):

```text
postgresql://postgres:PASSWORD@localhost/postgres?host=/cloudsql/toteat-pr-sheriff:europe-west1:pr-sheriff-db
```

Sustituye `PASSWORD`, `PROJECT_ID`, `REGION` e `INSTANCE_NAME` por tus valores. Esta URL la guardarás en Secret Manager.

### 3.5 Migraciones Drizzle

En local (con una URL que apunte a la misma DB, p. ej. vía proxy):

```bash
npm run db:generate
npm run db:migrate
```

O ejecutar el SQL generado en `drizzle/` desde la consola de Cloud SQL (Edit → run).

---

## Parte 4: Secrets en GCP (Secret Manager)

### 4.1 Habilitar Secret Manager

```bash
gcloud services enable secretmanager.googleapis.com
```

### 4.2 Crear secrets

En GCP la clave privada de la GitHub App **siempre** se usa como **contenido** (variable `GITHUB_PRIVATE_KEY_CONTENT`), nunca como archivo `.pem` montado. El secret guarda el contenido completo del archivo que descargaste de GitHub.

Sustituye `PROJECT_ID` por tu proyecto GCP.

```bash
# 1) GitHub App ID
echo -n "12345" | gcloud secrets create GITHUB_APP_ID --data-file=- --project=PROJECT_ID

# 2) GitHub Installation ID (opcional; número que copiaste)
echo -n "12345678" | gcloud secrets create GITHUB_INSTALLATION_ID --data-file=- --project=PROJECT_ID

# 3) GitHub Private Key (contenido del .pem)
gcloud secrets create GITHUB_PRIVATE_KEY_CONTENT --data-file=./path/to/tu-github-app.private-key.pem --project=PROJECT_ID

# 4) Webhook secret (el que configuraste en la GitHub App)
echo -n "tu-webhook-secret" | gcloud secrets create GITHUB_WEBHOOK_SECRET --data-file=- --project=PROJECT_ID

# 5) Slack Bot Token (el que ya usas en tu Slack real)
echo -n "xoxb-..." | gcloud secrets create SLACK_BOT_TOKEN --data-file=- --project=PROJECT_ID

# 6) DATABASE_URL (connection string de Cloud SQL)
echo -n "postgresql://postgres:PASSWORD@localhost/postgres?host=/cloudsql/PROJECT_ID:REGION:INSTANCE" | gcloud secrets create DATABASE_URL --data-file=- --project=PROJECT_ID

# 7) Token para proteger los jobs (reminders/blame)
echo -n "un-token-aleatorio-seguro" | gcloud secrets create JOBS_SECRET_TOKEN --data-file=- --project=PROJECT_ID
```

Dar a Cloud Run acceso a estos secrets (ver siguiente parte).

---

## Parte 5: Backend en Cloud Run

**Por qué Cloud Run (y qué implica en coste y recursos)**

La guía usa **Cloud Run** a propósito: es lo más eficiente para un backend que no recibe tráfico constante.

- **Escala a cero:** si no llega ninguna petición (webhook, health, cron), Cloud Run no mantiene ningún contenedor encendido. No pagas por tiempo de CPU cuando está inactivo.
- **Pago por uso:** solo pagas por el tiempo que tarda cada request (y por la memoria/CPU que uses en ese momento). Con pocos PRs y unos pocos cron al día, el coste suele ser muy bajo (incluso dentro del tier gratuito).
- **Arranque bajo demanda:** cuando GitHub envía un webhook o Cloud Scheduler llama a `/jobs/reminders`, Cloud Run arranca una instancia, atiende la petición y luego puede volver a cero. El “cold start” suele ser de 1–3 segundos; para webhooks y jobs eso es aceptable.

**Resumen:** el backend “vive” solo cuando hace falta (cuando hay una petición). No hace falta cambiar nada en el documento: esa opción ya está contemplada con Cloud Run.

### 5.1 Preparar el despliegue

- Código en el repo de toteat (ej. `toteat/pr-sheriff`).
- En la raíz del proyecto hay un `Dockerfile` (multi-stage: compila con TypeScript y deps de dev, la imagen final solo tiene deps de producción y `dist/`) que expone el puerto 8080. Cloud Run inyecta `PORT=8080`; el servidor escucha en `process.env.PORT || 3000` (`src/index.ts`).

### 5.2 Build y deploy

```bash
# Configurar proyecto
gcloud config set project PROJECT_ID

# Build con Cloud Build y push a Artifact Registry (o Container Registry)
gcloud run deploy pr-sheriff \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated
```

Si quieres que el webhook sea solo con autenticación (por ejemplo IAM), quita `--allow-unauthenticated` y configura GitHub con una cuenta de servicio; para webhooks públicos, GitHub no usa IAM, así que suele dejarse `--allow-unauthenticated` y la seguridad se hace con `GITHUB_WEBHOOK_SECRET`.

### 5.3 Montar secrets como variables de entorno

En la consola: **Cloud Run** → **pr-sheriff** → **Edit & deploy new revision** → **Variables & Secrets**:

- Añadir variable: `PORT` = `8080`.
- Añadir cada secret como “Reference a secret”:
  - `GITHUB_APP_ID` → secret `GITHUB_APP_ID`
  - `GITHUB_INSTALLATION_ID` → secret `GITHUB_INSTALLATION_ID`
  - `GITHUB_PRIVATE_KEY_CONTENT` → secret `GITHUB_PRIVATE_KEY_CONTENT`
  - `GITHUB_WEBHOOK_SECRET` → secret `GITHUB_WEBHOOK_SECRET`
  - `SLACK_BOT_TOKEN` → secret `SLACK_BOT_TOKEN`
  - `DATABASE_URL` → secret `DATABASE_URL`
  - `JOBS_SECRET_TOKEN` → secret `JOBS_SECRET_TOKEN`

O con `gcloud`:

```bash
gcloud run services update pr-sheriff \
  --region europe-west1 \
  --set-secrets="GITHUB_APP_ID=GITHUB_APP_ID:latest,GITHUB_PRIVATE_KEY_CONTENT=GITHUB_PRIVATE_KEY_CONTENT:latest,GITHUB_WEBHOOK_SECRET=GITHUB_WEBHOOK_SECRET:latest,SLACK_BOT_TOKEN=SLACK_BOT_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest,JOBS_SECRET_TOKEN=JOBS_SECRET_TOKEN:latest" \
  --set-secrets="GITHUB_INSTALLATION_ID=GITHUB_INSTALLATION_ID:latest"
```

La cuenta de servicio de Cloud Run debe tener permiso **Secret Manager Secret Accessor** sobre esos secrets.

### 5.4 Conectar Cloud Run a Cloud SQL

En **Cloud Run** → **pr-sheriff** → **Edit** → **Connections** (o “Cloud SQL” según la consola):

- Añadir la instancia Cloud SQL que creaste.

Así se monta el socket de Cloud SQL y la `DATABASE_URL` con `host=/cloudsql/...` funcionará.

### 5.5 URL del servicio

Después del deploy verás algo como:

```text
https://pr-sheriff-xxxxx-ew.a.run.app
```

- **Webhook GitHub:** `https://pr-sheriff-xxxxx-ew.a.run.app/webhook/github`
- **Health:** `https://pr-sheriff-xxxxx-ew.a.run.app/health`
- **Jobs:**  
  - `POST https://pr-sheriff-xxxxx-ew.a.run.app/jobs/reminders`  
  - `POST https://pr-sheriff-xxxxx-ew.a.run.app/jobs/blame`  
  Con header: `Authorization: Bearer <JOBS_SECRET_TOKEN>`.

---

## Parte 6: Configurar la GitHub App con la URL real

1. **GitHub** → Org **toteat** → **Settings** → **Developer settings** → **GitHub Apps** → tu app.
2. **Webhook** → **Webhook URL:**  
   `https://pr-sheriff-xxxxx-ew.a.run.app/webhook/github`
3. Guardar.
4. Asegúrate de que **Webhook secret** sea el mismo que el valor en Secret Manager (`GITHUB_WEBHOOK_SECRET`).

---

## Parte 7: Cron jobs (Reminders y Blame) con Cloud Scheduler

### 7.1 Habilitar Cloud Scheduler

```bash
gcloud services enable cloudscheduler.googleapis.com
```

### 7.2 Crear jobs HTTP con autenticación

Cloud Scheduler puede llamar a Cloud Run con OIDC (cuenta de servicio). Ejemplo para reminders (diario a las 9:00):

```bash
# Crear cuenta de servicio para el scheduler (si no existe)
gcloud iam service-accounts create pr-sheriff-invoker --display-name "PR Sheriff Job Invoker"

# Dar permiso a esa cuenta para invocar Cloud Run
gcloud run services add-iam-policy-binding pr-sheriff \
  --region europe-west1 \
  --member="serviceAccount:pr-sheriff-invoker@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# Job de reminders (ej. todos los días a 9:00)
gcloud scheduler jobs create http job-reminders \
  --schedule="0 9 * * *" \
  --uri="https://pr-sheriff-xxxxx-ew.a.run.app/jobs/reminders" \
  --http-method=POST \
  --oidc-service-account-email=pr-sheriff-invoker@PROJECT_ID.iam.gserviceaccount.com \
  --location=europe-west1
```

Para que Cloud Run acepte estas llamadas sin `Bearer JOBS_SECRET_TOKEN`, tendrías que usar un middleware que acepte o bien el token de jobs o bien el OIDC de Cloud Scheduler. La opción más simple es que el job use el **token** y que Cloud Scheduler lo envíe en el header. Cloud Scheduler no soporta “custom headers” con valores de Secret Manager de forma nativa, así que hay dos alternativas:

- **A)** Dejar los endpoints `/jobs/reminders` y `/jobs/blame` protegidos solo por `JOBS_SECRET_TOKEN` y llamarlos desde un **Cloud Function** o **Cloud Run** pequeño que lea el token desde Secret Manager y haga el POST con `Authorization: Bearer <token>`. Cloud Scheduler entonces llama a esa función (con OIDC).
- **B)** Añadir en tu backend la opción de aceptar también invocaciones firmadas por Cloud Scheduler (OIDC) y en Cloud Scheduler usar **OIDC** sin token custom.

Para la opción más directa (todo con token):

- Puedes usar **Cloud Scheduler + Cloud Build** o un **Cloud Function** que ejecute `curl` con el token. Ejemplo con **Cloud Functions** (Gen2) que lee el secret y llama al job:

Crear una función que ejecute la llamada con el token (invocada por Scheduler con OIDC). O, más simple para empezar: un **Cloud Scheduler job** que apunte a una **Cloud Function** que a su vez llame a tu Cloud Run con el header `Authorization: Bearer <token>` (el token lo lee la función desde Secret Manager).

Resumen práctico:

- **Opción rápida:** Crear 2 Cloud Functions (o 1 con 2 endpoints) que lean `JOBS_SECRET_TOKEN` y hagan `POST` a `.../jobs/reminders` y `.../jobs/blame`. Cloud Scheduler invoca esas funciones con OIDC (sin necesidad de pasar el token en Scheduler).

Si prefieres no tocar código, puedes usar **Cloud Build** con un step `curl` y guardar el token en Secret Manager, y que Cloud Scheduler dispare un trigger de Cloud Build (más engorroso). La opción más limpia es la función “invoker” que lee el secret y llama a Cloud Run.

### 7.3 Ejemplo de horarios

- **Reminders:** `0 9 * * *` (9:00 cada día).
- **Blame:** `0 10 * * 1-5` (10:00 de lunes a viernes).

Ajusta zona horaria en el job si lo necesitas (p. ej. `America/Santiago`).

---

## Parte 8: Slack

- El bot de Slack ya está instalado en el workspace real.
- Solo necesitas que el **Slack Bot Token** (`xoxb-...`) que usa ese bot esté guardado en Secret Manager como `SLACK_BOT_TOKEN` y referenciado en Cloud Run (hecho en la parte 5).
- No hace falta migrar ninguna “app de Slack” si ya usas la misma.

---

## Checklist final

- [ ] Repo bajo org **toteat** (creado o transferido).
- [ ] GitHub App creada en la org toteat con permisos y eventos correctos.
- [ ] App instalada en la org; **Installation ID** anotado y puesto en Secret Manager (opcional).
- [ ] **App ID**, contenido de la private key en **GITHUB_PRIVATE_KEY_CONTENT** (no archivo), **Webhook secret** en GCP Secret Manager.
- [ ] Cloud SQL (PostgreSQL) creada; **DATABASE_URL** en Secret Manager; migraciones aplicadas.
- [ ] Cloud Run desplegado con todos los secrets y conexión a Cloud SQL.
- [ ] Webhook URL de la GitHub App apuntando a `https://...run.app/webhook/github`.
- [ ] **Slack Bot Token** en Secret Manager y en Cloud Run.
- [ ] **JOBS_SECRET_TOKEN** creado y configurado en Cloud Run.
- [ ] Cloud Scheduler (o función invoker) configurado para `/jobs/reminders` y `/jobs/blame`.
- [ ] Probar: abrir un PR en un repo de toteat con `.pr-sheriff.yml` y comprobar asignación y Slack.
- [ ] Probar: `GET .../health` y, si aplica, una ejecución manual de un job.

---

## Probar en local con Docker (opcional)

Para validar que la imagen y la configuración se comportan como en GCP antes de desplegar:

1. **Construir la imagen** (desde la raíz del repo):
   ```bash
   docker build -t pr-sheriff .
   ```

2. **Levantar el contenedor** usando la clave como **contenido** (igual que en GCP), no como archivo montado. Fuerza `PORT=8080` para que coincida con el mapeo de puertos:
   ```bash
   docker run --rm -p 8080:8080 -e PORT=8080 \
     -e GITHUB_PRIVATE_KEY_PATH= \
     -e GITHUB_PRIVATE_KEY_CONTENT="$(cat secrets/github-app-key.pem)" \
     --env-file .env \
     pr-sheriff
   ```
   (`GITHUB_PRIVATE_KEY_PATH=` vacío hace que la app use solo `GITHUB_PRIVATE_KEY_CONTENT`.)

3. **Probar:**
   - Health: `curl http://localhost:8080/health`
   - Job reminders: `curl -X POST http://localhost:8080/jobs/reminders -H "Authorization: Bearer TU_JOBS_SECRET_TOKEN"`
   - Job blame: `curl -X POST http://localhost:8080/jobs/blame -H "Authorization: Bearer TU_JOBS_SECRET_TOKEN"`

Si el puerto 8080 ya está en uso (p. ej. por otro contenedor), para ese contenedor usa `docker stop <id>` o mapea otro puerto: `-p 8081:8080` y llama a `http://localhost:8081`.

---

## Referencias rápidas

| Variable de entorno | Origen |
|--------------------|--------|
| `GITHUB_APP_ID` | GitHub App → About → App ID |
| `GITHUB_INSTALLATION_ID` | URL de la instalación o API `GET /app/installations` |
| `GITHUB_PRIVATE_KEY_CONTENT` | Contenido del .pem generado en la app |
| `GITHUB_WEBHOOK_SECRET` | Configurado al crear/editar la app (Webhook) |
| `SLACK_BOT_TOKEN` | Slack App → OAuth & Permissions → Bot User OAuth Token |
| `DATABASE_URL` | Cloud SQL connection string (socket en Run) |
| `JOBS_SECRET_TOKEN` | Valor aleatorio que tú generes |

Documentación relacionada en el repo:

- `docs/SETUP.md` – Configuración local y clave privada.
- `docs/DEPLOYMENT.md` – Gestión de secrets por plataforma.
- `docs/DATABASE_SETUP.md` – Uso de la base de datos y migraciones.
