# Guía de Deployment

## Gestión de Secrets en Producción

**⚠️ NUNCA:**
- ❌ Subir el archivo `.pem` al repositorio
- ❌ Usar URLs públicas para secrets
- ❌ Hardcodear secrets en el código
- ❌ Commitear archivos `.pem` o `.key`

**✅ SIEMPRE:**
- ✅ Usar servicios de gestión de secrets
- ✅ Variables de entorno en la plataforma
- ✅ Rotar secrets periódicamente
- ✅ Usar permisos mínimos

---

## Opciones por Plataforma

### 1. AWS (EC2, ECS, Lambda, etc.)

**Opción A: AWS Secrets Manager (Recomendado)**

```typescript
// Instalar: npm install @aws-sdk/client-secrets-manager
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const client = new SecretsManagerClient({ region: 'us-east-1' })
const response = await client.send(
  new GetSecretValueCommand({ SecretId: 'pr-sheriff/github-app-key' })
)
const privateKey = response.SecretString
```

**Opción B: Variables de Entorno (ECS, Lambda) - Recomendado**

```bash
# En ECS Task Definition o Lambda Environment Variables
# Pasar el contenido completo del archivo como variable
GITHUB_PRIVATE_KEY_CONTENT="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----"

# O desde Secrets Manager (ver Opción A)
# El código detecta automáticamente si es path o contenido
```

**Opción C: SSM Parameter Store**

```bash
# Guardar en SSM
aws ssm put-parameter \
  --name "/pr-sheriff/github-app-key" \
  --value "$(cat secrets/github-app-key.pem)" \
  --type "SecureString"

# Leer en runtime (requiere IAM permissions)
aws ssm get-parameter --name "/pr-sheriff/github-app-key" --with-decryption
```

---

### 2. Google Cloud Platform (GCP)

**Opción A: Secret Manager (Recomendado)**

```typescript
// Instalar: npm install @google-cloud/secret-manager
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

const client = new SecretManagerServiceClient()
const [version] = await client.accessSecretVersion({
  name: 'projects/YOUR_PROJECT/secrets/github-app-key/versions/latest',
})
const privateKey = version.payload?.data?.toString()
```

**Opción B: Variables de Entorno (Cloud Run, Cloud Functions)**

```bash
# En Cloud Run o Cloud Functions
gcloud run deploy pr-sheriff \
  --set-env-vars="GITHUB_PRIVATE_KEY_CONTENT=$(cat secrets/github-app-key.pem)"
```

---

### 3. Azure

**Opción A: Azure Key Vault (Recomendado)**

```typescript
// Instalar: npm install @azure/keyvault-secrets @azure/identity
import { SecretClient } from '@azure/keyvault-secrets'
import { DefaultAzureCredential } from '@azure/identity'

const credential = new DefaultAzureCredential()
const client = new SecretClient('https://your-vault.vault.azure.net', credential)
const secret = await client.getSecret('github-app-key')
const privateKey = secret.value
```

---

### 4. Heroku

**Variables de Entorno (Config Vars)**

```bash
# Subir el contenido del archivo como variable
heroku config:set GITHUB_PRIVATE_KEY_CONTENT="$(cat secrets/github-app-key.pem)"

# O usar Heroku Secrets (addon)
```

---

### 5. Kubernetes

**Opción A: Kubernetes Secrets**

```yaml
# Crear secret
apiVersion: v1
kind: Secret
metadata:
  name: github-app-key
type: Opaque
stringData:
  private-key: |
    -----BEGIN RSA PRIVATE KEY-----
    ...
    -----END RSA PRIVATE KEY-----
```

```yaml
# Usar en deployment
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: pr-sheriff
        env:
        - name: GITHUB_PRIVATE_KEY_PATH
          value: /etc/secrets/private-key
        volumeMounts:
        - name: github-key
          mountPath: /etc/secrets
          readOnly: true
      volumes:
      - name: github-key
        secret:
          secretName: github-app-key
```

**Opción B: External Secrets Operator**

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: github-app-key
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: github-app-key
    creationPolicy: Owner
  data:
  - secretKey: private-key
    remoteRef:
      key: pr-sheriff/github-app-key
```

---

### 6. Docker / Docker Compose

**Opción A: Docker Secrets (Swarm)**

```bash
# Crear secret
echo "content-of-key" | docker secret create github_app_key -

# Usar en docker-compose.yml
version: '3.8'
services:
  pr-sheriff:
    secrets:
      - github_app_key
secrets:
  github_app_key:
    external: true
```

**Opción B: Variables de Entorno**

```bash
# En docker-compose.yml
version: '3.8'
services:
  pr-sheriff:
    environment:
      - GITHUB_PRIVATE_KEY_CONTENT=${GITHUB_PRIVATE_KEY_CONTENT}
    # O montar como volumen (menos seguro)
    volumes:
      - ./secrets:/app/secrets:ro
```

---

## Soporte Flexible (Ya Implementado)

El código ya soporta tanto archivo como contenido directo:

**Opción 1: Path a archivo (desarrollo local)**
```bash
GITHUB_PRIVATE_KEY_PATH=./secrets/github-app-key.pem
# O
GITHUB_PRIVATE_KEY_PATH=~/.ssh/github-app-key.pem
```

**Opción 2: Contenido directo (producción/cloud)**
```bash
GITHUB_PRIVATE_KEY_CONTENT="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
```

El código detecta automáticamente si es un path o contenido directo basándose en el formato.

---

## Recomendación General

**Para la mayoría de casos:**

1. **Desarrollo local:** Archivo en `secrets/` o `~/.ssh/`
2. **Producción:** 
   - **Cloud:** Secret Manager de la plataforma (AWS Secrets Manager, GCP Secret Manager, etc.)
   - **Kubernetes:** Kubernetes Secrets o External Secrets Operator
   - **Simple:** Variable de entorno con el contenido del archivo

**Ejemplo práctico (AWS ECS):**

```bash
# 1. Guardar en Secrets Manager
aws secretsmanager create-secret \
  --name pr-sheriff/github-app-key \
  --secret-string file://secrets/github-app-key.pem

# 2. En ECS Task Definition, agregar variable
GITHUB_PRIVATE_KEY_CONTENT=<valor desde Secrets Manager>

# 3. El código lee desde variable de entorno
```

---

## Checklist de Seguridad

- [ ] Secret nunca en el repositorio
- [ ] Secret Manager o equivalente en producción
- [ ] Permisos IAM/roles mínimos necesarios
- [ ] Rotación periódica de secrets
- [ ] Logging de acceso a secrets (auditoría)
- [ ] Encriptación en tránsito y en reposo
- [ ] Backup de secrets (si aplica)
