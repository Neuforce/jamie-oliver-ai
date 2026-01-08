# Guía Visual: Configurar Root Directory en Vercel

## Paso a Paso en Vercel Dashboard

### 1. Crear Nuevo Proyecto

1. Ve a https://vercel.com/new
2. Selecciona "Import Git Repository"
3. Elige tu repositorio de GitHub

### 2. Configurar Root Directory

**IMPORTANTE**: Después de seleccionar el repositorio, verás una pantalla de configuración. Aquí es donde configuras el Root Directory:

#### Opción A: Si ves un campo "Root Directory"
1. Busca el campo **"Root Directory"** o **"Configure Project"**
2. Haz clic en **"Edit"** o **"Configure"** (puede estar al lado del nombre del proyecto)
3. En el campo que aparece, escribe o selecciona: `jo-sem-search`
4. Haz clic en **"Continue"** o **"Deploy"**

#### Opción B: Si no ves el campo inmediatamente
1. Después de importar el repositorio, verás una pantalla con:
   - Project Name
   - Framework Preset
   - Root Directory ← **AQUÍ**
2. Haz clic en **"Root Directory"** o en el botón **"Edit"** al lado
3. Selecciona `jo-sem-search` del dropdown o escríbelo
4. Haz clic en **"Continue"**

### 3. Configurar Variables de Entorno

Después de configurar el Root Directory, antes de hacer Deploy:

1. Haz clic en **"Environment Variables"** o **"Add Environment Variable"**
2. Agrega:
   ```
   SUPABASE_URL = https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = tu-service-role-key
   PYTHON_VERSION = 3.11
   ```
3. Selecciona los ambientes: Production, Preview, Development

### 4. Deploy

1. Haz clic en **"Deploy"**
2. Espera a que termine el build
3. Verifica que la URL funcione: `https://tu-proyecto.vercel.app/health`

## Si Ya Tienes el Proyecto Creado

Si ya creaste el proyecto pero con el root directory incorrecto:

1. Ve a tu proyecto en Vercel Dashboard
2. Ve a **Settings** → **General**
3. Busca la sección **"Root Directory"**
4. Haz clic en **"Edit"**
5. Cambia a `jo-sem-search`
6. Guarda los cambios
7. Esto disparará un nuevo deployment

## Verificar que Funcionó

Después del deploy, verifica:

1. **Health Check**: `https://tu-proyecto.vercel.app/health`
   - Debería retornar: `{"status": "healthy", ...}`

2. **API Docs**: `https://tu-proyecto.vercel.app/docs`
   - Debería mostrar la documentación de Swagger

3. **Logs en Vercel**:
   - Ve a tu proyecto → **Deployments** → Click en el último deployment → **Logs**
   - Deberías ver que detectó Python y las dependencias

## Troubleshooting

### "Root Directory" no aparece
- Asegúrate de estar en la pantalla de configuración **antes** de hacer el primer deploy
- Si ya hiciste deploy, ve a Settings → General → Root Directory

### Error: "No vercel.json found"
- Verifica que el archivo `vercel.json` esté en `jo-sem-search/vercel.json`
- Verifica que el Root Directory esté configurado correctamente

### Error: "No api/index.py found"
- Verifica que el archivo `api/index.py` esté en `jo-sem-search/api/index.py`
- Verifica que el Root Directory esté configurado correctamente

### Build falla
- Revisa los logs en Vercel
- Verifica que `requirements.txt` tenga todas las dependencias
- Verifica que las variables de entorno estén configuradas
