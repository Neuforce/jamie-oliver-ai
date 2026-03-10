# Integración con Linear

El proyecto consulta Linear (issues, estado) vía **API GraphQL** usando `curl`. No hay “integración mágica”: solo hace falta tener **LINEAR_API_KEY** en el entorno.

## 1. Crear una API key en Linear

1. Entra en [Linear](https://linear.app/neuforce).
2. **Settings** → **API** → **Personal API keys**.
3. **Create key**, copia el valor (empieza por `lin_api_...`).

## 2. Cómo hacer que el agente y los scripts la vean

Para que **el agente de Cursor** y los scripts puedan consultar Linear, `LINEAR_API_KEY` tiene que estar definida cuando se ejecutan los comandos.

### Opción A: Variables de entorno del workspace (recomendado para el agente)

Si Cursor inyecta el `env` del workspace al ejecutar comandos:

1. Crea o edita `.cursor/environment.json` en la raíz del repo.
2. Añade tu key (y mantén el archivo fuera de git si no quieres commitear la key):

```json
{
  "env": {
    "LINEAR_API_KEY": "lin_api_xxxxxxxx"
  }
}
```

3. Añade a `.gitignore` si hace falta:  
   `.cursor/environment.json`

### Opción B: Archivo .env en la raíz

1. En la raíz del repo (junto a `package.json` / `apps/`), crea o edita `.env.local`.
2. Añade:

```bash
LINEAR_API_KEY=lin_api_xxxxxxxx
```

3. Para que el agente la use, Cursor tiene que ejecutar los comandos en un shell que cargue este archivo (depende de tu configuración). Para **tu** terminal siempre puedes hacer:

```bash
source .env.local
./scripts/linear.sh list
```

### Opción C: Exportar en la sesión

En la terminal donde vayas a correr el script o los curls:

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxx"
./scripts/linear.sh list
```

## 3. Comprobar que funciona

```bash
./scripts/linear.sh list
```

Si ves una lista de issues (o un JSON con `data.issues`), la integración está bien configurada. Si ves "Authentication required" o 401, la key no está llegando o es incorrecta.

## 4. Proyecto en Linear

- **Supertab - JamieOliverAI:**  
  https://linear.app/neuforce/project/supertab-jamieoliverai-41f9c9877729
