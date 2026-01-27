# Guía de Setup

## Configuración de GitHub App Private Key

### Ubicaciones Recomendadas

**Para desarrollo local:**

1. **Opción 1: Directorio `~/.ssh/` (Recomendado)**
   ```bash
   # Similar a SSH keys, fácil de encontrar
   ~/.ssh/github-app-key.pem
   ```
   ```bash
   # En .env
   GITHUB_PRIVATE_KEY_PATH=~/.ssh/github-app-key.pem
   ```

2. **Opción 2: Directorio de configuración**
   ```bash
   # Crear directorio si no existe
   mkdir -p ~/.config/pr-sheriff
   
   # Guardar la key ahí
   ~/.config/pr-sheriff/github-app-key.pem
   ```
   ```bash
   # En .env
   GITHUB_PRIVATE_KEY_PATH=~/.config/pr-sheriff/github-app-key.pem
   ```

3. **Opción 3: Dentro del proyecto (menos recomendado)**
   ```bash
   # Crear directorio secrets/ en la raíz del proyecto
   mkdir -p secrets
   
   # Guardar la key ahí
   secrets/github-app-key.pem
   ```
   ```bash
   # En .env (path relativo o absoluto)
   GITHUB_PRIVATE_KEY_PATH=./secrets/github-app-key.pem
   # O
   GITHUB_PRIVATE_KEY_PATH=/ruta/completa/al/proyecto/pr-sheriff/secrets/github-app-key.pem
   ```
   ⚠️ **Nota:** Esta opción es menos segura porque:
   - El archivo está en el repositorio (aunque ignorado)
   - Mayor riesgo de commitear accidentalmente
   - No recomendado para producción

4. **Opción 4: Fuera del proyecto (absoluto)**
   ```bash
   # Cualquier ubicación fuera del proyecto
   /Users/tu-usuario/.secrets/github-app-key.pem
   ```
   ```bash
   # En .env
   GITHUB_PRIVATE_KEY_PATH=/Users/tu-usuario/.secrets/github-app-key.pem
   ```

**Para producción:**

- **Cloud Secrets Manager** (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)
- **Variables de entorno** (no usar archivo, pasar el contenido directamente)
- **Kubernetes Secrets**
- **Docker Secrets**

### Seguridad

1. **Permisos del archivo:**
   ```bash
   # Solo lectura para el usuario
   chmod 600 ~/.ssh/github-app-key.pem
   ```

2. **Nunca commitear:**
   - ✅ Ya está en `.gitignore`
   - ✅ Nunca hacer `git add` de archivos `.pem` o `.key`
   - ✅ Verificar antes de commitear: `git status`

3. **Rotación:**
   - Rotar la key periódicamente
   - Actualizar en todos los ambientes cuando se rote

### Cómo Obtener la Private Key

1. Ve a tu GitHub App settings
2. En "Private keys" → "Generate a private key"
3. Descarga el archivo `.pem`
4. Guárdalo en una de las ubicaciones recomendadas
5. Configura los permisos: `chmod 600 <path>`

### Ejemplo Completo

**Opción A: Fuera del proyecto (Recomendado)**
```bash
# 1. Descargar la key de GitHub App
# 2. Guardarla en ~/.ssh/
mv ~/Downloads/github-app.2024-01-27.private-key.pem ~/.ssh/github-app-key.pem

# 3. Configurar permisos
chmod 600 ~/.ssh/github-app-key.pem

# 4. Configurar en .env
echo "GITHUB_PRIVATE_KEY_PATH=~/.ssh/github-app-key.pem" >> .env
```

**Opción B: Dentro del proyecto (secrets/)**
```bash
# 1. Crear directorio secrets/ (ya está en .gitignore)
mkdir -p secrets

# 2. Mover la key ahí
mv ~/Downloads/github-app.2024-01-27.private-key.pem secrets/github-app-key.pem

# 3. Configurar permisos
chmod 600 secrets/github-app-key.pem

# 4. Configurar en .env (path relativo)
echo "GITHUB_PRIVATE_KEY_PATH=./secrets/github-app-key.pem" >> .env

# 5. Verificar que está en .gitignore
git status  # No debería aparecer secrets/github-app-key.pem
```

### Verificar que Funciona

```bash
# Verificar que el archivo existe y tiene los permisos correctos
ls -la ~/.ssh/github-app-key.pem
# Debería mostrar: -rw------- (600)

# Verificar que el servidor puede leerlo
node -e "const fs = require('fs'); console.log(fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH || '~/.ssh/github-app-key.pem', 'utf-8').substring(0, 50))"
```

### Troubleshooting

**Error: "ENOENT: no such file or directory"**
- Verifica que el path sea correcto
- Usa path absoluto si `~` no funciona
- Verifica que el archivo existe: `ls -la <path>`

**Error: "EACCES: permission denied"**
- Configura permisos: `chmod 600 <path>`
- Verifica que el usuario tiene acceso al archivo

**Error: "Invalid private key"**
- Verifica que el archivo no esté corrupto
- Asegúrate de que es el archivo completo (incluye `-----BEGIN RSA PRIVATE KEY-----` y `-----END RSA PRIVATE KEY-----`)
