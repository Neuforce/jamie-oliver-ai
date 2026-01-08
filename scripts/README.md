# Scripts de Desarrollo

Scripts helper para facilitar el desarrollo local del monorepo.

## Scripts Disponibles

### `setup.sh`
Setup inicial del monorepo. Instala todas las dependencias.

```bash
./scripts/setup.sh
```

**Qué hace:**
- Instala dependencias npm del frontend
- Crea virtual environments para backends Python
- Instala dependencias Python (Poetry o pip)
- Configura el paquete ccai
- Hace los scripts ejecutables

---

### `logs.sh`
Ver logs de los servicios en desarrollo.

```bash
# Ver logs de todos los servicios
./scripts/logs.sh all

# Ver logs de un servicio específico
./scripts/logs.sh voice        # Backend-voice (Docker)
./scripts/logs.sh search       # Backend-search
./scripts/logs.sh frontend     # Frontend

# Seguir logs en tiempo real
./scripts/logs.sh voice -f     # Backend-voice con -f (follow)
./scripts/logs.sh search -f    # Backend-search con -f
./scripts/logs.sh frontend -f  # Frontend con -f

# Ayuda
./scripts/logs.sh help
```

**Notas:**
- Los logs de `backend-search` y `frontend` se guardan en `logs/backend-search.log` y `logs/frontend.log`
- Los logs de `backend-voice` se obtienen directamente de Docker Compose
- Usa `-f` o `--follow` para seguir logs en tiempo real

---

### `dev-all.sh`
Inicia todos los servicios en modo desarrollo.

```bash
./scripts/dev-all.sh
```

**Qué inicia:**
- Frontend en `http://localhost:3000`
- Backend-Voice (Docker) en `ws://localhost:8100/ws/voice`
- Backend-Search en `http://localhost:8000`

**Nota:** Presiona `Ctrl+C` para detener todos los servicios.

---

### `dev-frontend.sh`
Inicia solo el frontend.

```bash
./scripts/dev-frontend.sh
```

Equivalente a:
```bash
cd apps/frontend && npm run dev
```

---

### `dev-backend-voice.sh`
Inicia solo el backend-voice usando Docker Compose.

```bash
./scripts/dev-backend-voice.sh
```

Equivalente a:
```bash
cd infrastructure && docker-compose up backend-voice
```

**Requisitos:**
- Docker Desktop corriendo
- Variables de entorno configuradas en `infrastructure/docker-compose.yml`

---

### `dev-backend-search.sh`
Inicia solo el backend-search.

```bash
./scripts/dev-backend-search.sh
```

**Qué hace:**
- Crea virtual environment si no existe
- Instala dependencias si es necesario
- Inicia servidor FastAPI con hot-reload

Equivalente a:
```bash
cd apps/backend-search
source .venv/bin/activate
python -m uvicorn recipe_search_agent.api:app --reload
```

---

## Uso Recomendado

### Primera vez
```bash
# 1. Setup inicial
./scripts/setup.sh

# 2. Configurar variables de entorno
# Edita apps/frontend/.env
# Edita apps/backend-voice/.env
# Edita apps/backend-search/.env

# 3. Iniciar todos los servicios
./scripts/dev-all.sh
```

### Desarrollo diario
```bash
# Opción 1: Todos los servicios
./scripts/dev-all.sh

# Opción 2: Solo el servicio que estás desarrollando
./scripts/dev-frontend.sh
# o
./scripts/dev-backend-voice.sh
# o
./scripts/dev-backend-search.sh
```

---

## Troubleshooting

### Scripts no son ejecutables
```bash
chmod +x scripts/*.sh
```

### Docker no está corriendo
```bash
# macOS: Abre Docker Desktop
# Linux: sudo systemctl start docker
```

### Virtual environment no se crea
```bash
# Verifica que Python 3.11+ esté instalado
python3 --version

# Crea manualmente
cd apps/backend-search
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Dependencias no se instalan
```bash
# Frontend
cd apps/frontend && rm -rf node_modules && npm install

# Backend-Search
cd apps/backend-search
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

---

## Notas

- Los scripts asumen que se ejecutan desde la raíz del monorepo
- Los scripts usan rutas relativas, así que asegúrate de estar en el directorio correcto
- `dev-all.sh` puede requerir permisos para ejecutar múltiples procesos en background
