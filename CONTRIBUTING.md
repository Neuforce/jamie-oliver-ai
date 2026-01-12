# Contributing to Jamie Oliver AI

Thank you for contributing to Jamie Oliver AI! This document outlines our development workflow and standards.

## Table of Contents

- [Getting Started](#getting-started)
- [Branch Strategy](#branch-strategy)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Standards](#code-standards)

## Getting Started

1. Clone the repository
2. Follow the [Quick Start](README.md#quick-start) guide
3. Pick up an issue from [Linear](https://linear.app/neuforce/project/supertab-jamieoliverai-41f9c9877729)

## Branch Strategy

### Branch Naming Convention

All branches should follow this pattern:

```
<type>/<ticket>-<short-description>
```

| Type | Purpose | Example |
|------|---------|---------|
| `feature/` | New features | `feature/neu-124-recipe-discovery` |
| `fix/` | Bug fixes | `fix/neu-150-audio-playback-issue` |
| `docs/` | Documentation only | `docs/neu-292-comprehensive-readme` |
| `chore/` | Maintenance tasks | `chore/neu-300-update-dependencies` |
| `refactor/` | Code refactoring | `refactor/neu-310-voice-service-cleanup` |

### Workflow

```
main (protected)
  │
  ├── feature/neu-124-recipe-discovery
  │     └── commits...
  │           └── PR → main
  │
  └── fix/neu-150-audio-playback
        └── commits...
              └── PR → main
```

1. **Create branch** from `main` with proper naming
2. **Make commits** following conventional commits format
3. **Push branch** to origin
4. **Create PR** targeting `main`
5. **Request review** from team members
6. **Merge** after approval (squash merge preferred)

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear, traceable history.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, missing semicolons, etc. |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks, dependency updates |
| `perf` | Performance improvements |

### Scopes

| Scope | Description |
|-------|-------------|
| `frontend` | Frontend React app |
| `voice` | Backend-voice service |
| `search` | Backend-search service |
| `docker` | Docker/infrastructure |
| `ccai` | Shared ccai package |
| `deps` | Dependencies |

### Examples

```bash
# Feature
feat(voice): add pause and resume cooking commands

# Bug fix
fix(search): handle empty query gracefully

# Documentation
docs(readme): add architecture diagram

# Multiple scopes
feat(voice,frontend): implement voice activity detection

# Breaking change
feat(api)!: change search response format

BREAKING CHANGE: The search API now returns results in a new format.
```

### Referencing Linear Issues

Include the Linear issue ID in commit body when relevant:

```bash
feat(voice): add timer management commands

Implements timer functionality for cooking mode.

Closes NEU-134
```

## Pull Request Process

### Before Creating a PR

- [ ] Code compiles without errors
- [ ] All tests pass locally
- [ ] Code follows style guidelines
- [ ] Self-reviewed the changes
- [ ] Updated documentation if needed

### PR Title Format

Use the same format as commits:

```
feat(voice): add pause and resume commands
```

### PR Description Template

```markdown
## Description
Brief description of changes.

## Linear Issue
NEU-XXX

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] Tested on Docker

## Screenshots (if UI changes)
<!-- Add screenshots here -->

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings introduced
```

### Review Process

1. At least **1 approval** required before merge
2. All CI checks must pass
3. Resolve all review comments
4. Use **squash merge** to keep history clean

## Code Standards

### Python (Backend Services)

- **Formatter:** Black (line length 100)
- **Linter:** Ruff
- **Type hints:** Required for public functions
- **Docstrings:** Required for public classes and functions

```python
def search_recipes(
    query: str,
    filters: SearchFilters | None = None,
    top_k: int = 10,
) -> list[RecipeMatch]:
    """
    Search recipes using semantic similarity.

    Args:
        query: Natural language search query.
        filters: Optional filters for category, mood, etc.
        top_k: Maximum number of results to return.

    Returns:
        List of matching recipes sorted by relevance.
    """
    ...
```

### TypeScript/React (Frontend)

- **Formatter:** Prettier
- **Linter:** ESLint
- **Components:** Functional components with hooks
- **Types:** TypeScript strict mode

```typescript
interface RecipeCardProps {
  recipe: Recipe;
  onSelect: (id: string) => void;
}

export function RecipeCard({ recipe, onSelect }: RecipeCardProps) {
  // ...
}
```

### File Organization

```
feature/
├── components/      # React components
├── hooks/           # Custom hooks
├── utils/           # Utility functions
├── types.ts         # TypeScript types
└── index.ts         # Public exports
```

## Questions?

- Check [existing issues](https://linear.app/neuforce/project/supertab-jamieoliverai-41f9c9877729)
- Ask in the team Slack channel
- Contact the project lead
