# Jamie Oliver AI - MCP & OpenAI-Compatible Architecture

## Vision

Transform Jamie Oliver AI tools into **standard, publishable AI skills** that work across:
- **Claude** (via MCP - Model Context Protocol)
- **ChatGPT** (via Custom GPTs / Actions)
- **Our own app** (via the same tool definitions)

## Current vs Proposed Architecture

### Current (Tightly Coupled)
```
┌─────────────────────────────────────────────────┐
│ backend-search                                   │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │ discovery_tools.py│  │ chat_agent.py       │  │
│  │ (CCAI functions)  │──│ (SimpleBrain)       │  │
│  └──────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Proposed (MCP-Compatible)
```
┌─────────────────────────────────────────────────────────────────┐
│                    Jamie Oliver MCP Server                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Tool Definitions (OpenAPI/JSON Schema)                    │   │
│  │  - search_recipes                                         │   │
│  │  - get_recipe_details                                     │   │
│  │  - suggest_for_mood                                       │   │
│  │  - plan_meal                                              │   │
│  │  - create_shopping_list                                   │   │
│  │  - start_cooking_session                                  │   │
│  │  - get_cooking_guidance                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │              Tool Implementations                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │  │
│  │  │ Recipe      │  │ Cooking     │  │ Meal Planning   │    │  │
│  │  │ Search      │  │ Session     │  │ Service         │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌─────────────┐      ┌─────────────┐
    │   Claude    │     │   ChatGPT   │      │  Our App    │
    │ (via MCP)   │     │ (via API)   │      │ (via SSE)   │
    └─────────────┘     └─────────────┘      └─────────────┘
```

## MCP Protocol Overview

Anthropic's MCP defines three primitives:

### 1. **Resources** - Data the AI can access
```json
{
  "uri": "jamie://recipes/chicken-tikka-masala",
  "name": "Chicken Tikka Masala Recipe",
  "mimeType": "application/json"
}
```

### 2. **Tools** - Actions the AI can perform
```json
{
  "name": "search_recipes",
  "description": "Search Jamie Oliver's recipe collection",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "What the user wants to cook"
      },
      "max_results": {
        "type": "integer",
        "default": 5
      }
    },
    "required": ["query"]
  }
}
```

### 3. **Prompts** - Reusable prompt templates
```json
{
  "name": "jamie_cooking_guide",
  "description": "Jamie Oliver persona for cooking guidance",
  "arguments": [
    {"name": "recipe_id", "required": true}
  ]
}
```

## Proposed File Structure

```
packages/
  jamie-mcp/                    # New MCP Server Package
    ├── package.json            # Node.js package (MCP uses JS/TS)
    ├── src/
    │   ├── index.ts            # MCP server entry point
    │   ├── tools/
    │   │   ├── schemas/        # JSON Schema definitions
    │   │   │   ├── search_recipes.json
    │   │   │   ├── get_recipe_details.json
    │   │   │   ├── suggest_for_mood.json
    │   │   │   ├── plan_meal.json
    │   │   │   └── cooking_session.json
    │   │   └── handlers/       # Tool implementations
    │   │       ├── search.ts
    │   │       ├── cooking.ts
    │   │       └── planning.ts
    │   ├── resources/
    │   │   └── recipes.ts      # Recipe resource provider
    │   └── prompts/
    │       ├── discovery.ts    # Jamie discovery persona
    │       └── cooking.ts      # Jamie cooking persona
    └── README.md

apps/
  backend-search/
    recipe_search_agent/
      ├── tools/                # Refactored to use schemas
      │   ├── __init__.py
      │   ├── loader.py         # Load JSON Schema tools
      │   └── executor.py       # Execute tools
      └── mcp_adapter.py        # Adapter for MCP protocol
```

## Tool Definition Format (OpenAI-Compatible)

Each tool defined as JSON Schema that works with both OpenAI and MCP:

```json
// schemas/search_recipes.json
{
  "name": "search_recipes",
  "description": "Search Jamie Oliver's curated recipe collection using semantic search. Returns recipes matching the user's request with descriptions and metadata.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language description of what the user wants to cook (e.g., 'quick pasta for tired weeknight', 'impressive dinner party main')"
      },
      "max_results": {
        "type": "integer",
        "description": "Maximum number of recipes to return",
        "default": 5,
        "minimum": 1,
        "maximum": 20
      }
    },
    "required": ["query"]
  },
  "returns": {
    "type": "object",
    "properties": {
      "recipes": {
        "type": "array",
        "items": {
          "$ref": "#/definitions/RecipeSummary"
        }
      }
    }
  },
  "definitions": {
    "RecipeSummary": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "estimated_time": {"type": "string"},
        "difficulty": {"type": "string"},
        "servings": {"type": "integer"}
      }
    }
  }
}
```

## Implementation Plan

### Phase 1: Standardize Tool Definitions
- [ ] Create JSON Schema files for all existing tools
- [ ] Build schema loader for Python (CCAI adapter)
- [ ] Refactor discovery_tools.py to use schemas
- [ ] Ensure backward compatibility with current app

### Phase 2: Build MCP Server
- [ ] Create `packages/jamie-mcp` Node.js package
- [ ] Implement MCP server with tool handlers
- [ ] Add recipe resources (browse recipes)
- [ ] Add Jamie persona prompts
- [ ] Test with Claude Desktop

### Phase 3: OpenAI Custom GPT
- [ ] Generate OpenAPI spec from tool schemas
- [ ] Create Jamie Oliver Custom GPT
- [ ] Configure actions to call our API
- [ ] Publish to GPT Store (optional)

### Phase 4: Unified API
- [ ] Single API that serves:
  - MCP clients (Claude)
  - OpenAI function calling (ChatGPT)
  - Our frontend (SSE streaming)
- [ ] Shared authentication/rate limiting
- [ ] Usage analytics

## Benefits

1. **Write Once, Run Anywhere**: Same tool definitions work across all platforms
2. **Publishable Skills**: Can publish to Claude/ChatGPT marketplaces
3. **Standard Protocol**: Following MCP means compatibility with growing ecosystem
4. **Better Testing**: JSON Schema enables automated validation
5. **Documentation**: Schemas serve as living documentation
6. **Future-Proof**: Ready for new AI platforms that adopt these standards

## Example: Using Jamie MCP with Claude Desktop

Once built, users could add Jamie Oliver to Claude Desktop:

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "jamie-oliver": {
      "command": "npx",
      "args": ["@jamie-oliver/mcp-server"],
      "env": {
        "JAMIE_API_KEY": "..."
      }
    }
  }
}
```

Then in Claude:
> "Hey Claude, use Jamie Oliver to help me plan a dinner party for 6 people"

Claude would automatically use the Jamie tools!

## Questions to Decide

1. **Scope**: Start with discovery tools only, or include cooking session tools?
2. **Hosting**: Self-hosted MCP server or publish to npm?
3. **Auth**: API key per user or public access?
4. **Priority**: Build MCP first (Claude) or OpenAPI first (ChatGPT)?
