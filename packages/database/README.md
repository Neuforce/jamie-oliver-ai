# @jamie-oliver-ai/database

Database schema and migrations for Jamie Oliver AI, managed with Prisma.

## Setup

1. **Install dependencies**
   ```bash
   cd packages/database
   npm install
   ```

2. **Configure environment**
   
   Create a `.env` file in this directory with your Supabase connection string:
   
   ```bash
   # packages/database/.env
   DATABASE_URL="postgresql://postgres.pvwavnoxjykokarimiuo:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
   ```
   
   **To get your connection string:**
   1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
   2. Select the Jamie Oliver AI project
   3. Navigate to **Project Settings > Database > Connection string**
   4. Copy the **Transaction pooler** connection string (Mode: Transaction)
   5. Replace `[PASSWORD]` with your database password

3. **Generate Prisma client**
   ```bash
   npm run db:generate
   ```

## Commands

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database (dev only, no migration) |
| `npm run db:migrate` | Create and apply migrations |
| `npm run db:migrate:deploy` | Apply pending migrations (production) |
| `npm run db:migrate:reset` | Reset database and apply all migrations |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:seed` | Run seed script |
| `npm run db:format` | Format schema file |

## Schema Overview

### Core Tables

- **`recipes`** - Single source of truth for all recipe data
  - `slug` - URL-friendly identifier (e.g., `mushroom-risotto`)
  - `recipe_json` - Full JOAv0 document
  - `metadata` - Computed fields for fast queries
  - `quality_score` - 0-100 quality rating
  - `status` - draft/published/archived

- **`recipe_versions`** - Version history for recipes
  - Automatically created when recipe is updated
  - Enables rollback to previous versions

### Existing Tables (managed externally)

- **`recipe_index`** - Search metadata (legacy, being migrated)
- **`intelligent_recipe_chunks`** - Semantic search embeddings

## Migrations

### Creating a new migration

```bash
# Make changes to prisma/schema.prisma, then:
npm run db:migrate -- --name describe_your_change

# Example:
npm run db:migrate -- --name add_recipe_tags
```

### Deploying to production

```bash
npm run db:migrate:deploy
```

### Resetting development database

```bash
npm run db:migrate:reset
```

## Working with Supabase

The schema is designed to work with Supabase:

1. **pgvector** - Vector embeddings for semantic search
2. **UUID** - Primary keys use UUID
3. **JSONB** - Recipe data stored as JSONB for flexibility
4. **RLS** - Row Level Security can be added via Supabase dashboard

### Connection Pooling

- Use `DATABASE_URL` (pooled) for application connections
- Use `DIRECT_URL` for migrations (bypasses pooler)

## Type Generation

After running `npm run db:generate`, you can import types:

```typescript
import { Recipe, RecipeStatus } from '@prisma/client';

// Or use the full client
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Example query
const recipes = await prisma.recipe.findMany({
  where: { status: 'published' },
  orderBy: { qualityScore: 'desc' },
});
```
