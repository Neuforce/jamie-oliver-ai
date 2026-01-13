#!/bin/bash
# Setup Recipe Data Platform feature branch
# Run this script from the project root

set -e

echo "=== Recipe Data Platform Branch Setup ==="

# Check current status
echo "Current git status:"
git status --short

# Create or switch to feature branch
echo ""
echo "Creating/switching to feature/recipe-data-platform branch..."
git checkout -b feature/recipe-data-platform 2>/dev/null || git checkout feature/recipe-data-platform

# Add all the new files
echo ""
echo "Staging new files..."
git add apps/backend-search/db/recipes_table.sql
git add apps/backend-search/recipe_pipeline/
git add apps/backend-voice/src/services/recipe_service.py
git add apps/backend-voice/src/tools/recipe_tools.py
git add docs/architecture/
git add .github/pull_request_template.md

# Show what's staged
echo ""
echo "Files staged for commit:"
git diff --cached --name-only

# Commit
echo ""
echo "Committing..."
git commit -m "feat: Recipe Data Platform - Supabase as single source of truth

- Add recipes table schema with versioning
- Create recipe enhancement pipeline (enhancer, validator, uploader)  
- Add migration CLI for existing recipes
- Update backend-voice to fetch from Supabase
- Add architecture documentation

Relates to: Recipe Data Platform Epic"

# Push
echo ""
echo "Pushing to origin..."
git push -u origin feature/recipe-data-platform

echo ""
echo "=== Done! ==="
echo "Branch feature/recipe-data-platform created and pushed."
echo ""
echo "Next steps:"
echo "1. Apply database schema in Supabase SQL Editor"
echo "2. Run: cd apps/backend-search && python -m recipe_pipeline.migrate --source-dir ../../data/recipes --enhance --publish"
