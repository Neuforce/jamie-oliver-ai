# Tests

This directory contains backend-search tests.

## Files

- **`test_api_examples.py`**: Example requests against the search API
- **`test_chunker.py`**: Manual chunker script (requires JSON fixture; not collected by pytest)

For PDF → chunk visualization (Ollama), use `scripts/visualize_recipe_chunks.py` instead.
- **`test_search_agent.py`**: Semantic search agent tests
- **`test_workflow_locally.sh`**: Run the full workflow locally

## Running tests

```bash
# All tests
pytest tests/

# Single file
pytest tests/test_search_agent.py

# Verbose
pytest tests/ -v

# Full local workflow
bash tests/test_workflow_locally.sh
```
