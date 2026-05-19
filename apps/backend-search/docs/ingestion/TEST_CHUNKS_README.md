# Test chunks — visualization script

Inspect Llama-generated “intelligent” chunks from recipe PDFs **without** writing to the database.

## Prerequisites

1. **Ollama running**
   ```bash
   curl http://localhost:11434/api/tags

   # If not running:
   ollama serve
   ```

2. **Llama 3.1 pulled**
   ```bash
   ollama pull llama3.1
   ```

3. **Virtualenv with deps**
   ```bash
   cd jamie-oliver-ai
   source .venv/bin/activate
   ```

4. **Patience**
   - Llama may take **2–5 minutes** per PDF  
   - Client timeout is 5 minutes  
   - First call after `ollama serve` can be slower  

## Usage

### Default PDF (`happy-fish-pie.pdf`)
```bash
python tests/test_chunks.py
```

### Specific PDF
```bash
python tests/test_chunks.py --pdf data/processed_pdfs/beef-quince-stew-beef-recipes-jamie-oliver.pdf
```

### Different model
```bash
python tests/test_chunks.py --model llama3.2
```

### Verbose logs
```bash
python tests/test_chunks.py --verbose
```

### Help
```bash
python tests/test_chunks.py --help
```

## Script output

1. **Pipeline steps** with progress markers  
2. **Per chunk:**
   - Index (e.g. Chunk 1/5)  
   - Search intent  
   - Character count  
   - SHA256 prefix  
   - LLM analysis JSON  
   - Full chunk text (wrapped ~80 cols)  

3. **Aggregate stats:**
   - Total chunks  
   - Avg / min / max size  
   - Distinct search intents  

## Sample output

```
============================================================
Processing: happy-fish-pie.pdf
============================================================

Step 1: Extracting text from PDF...
✓ Extracted 1866 characters

Step 2: Understanding recipe with Llama...
✓ Recipe understood
  Title: Happy Fish Pie

Step 3: Building JOAv0 structure...
✓ JOAv0 document created

Step 4: Generating intelligent chunks...
✓ Generated 5 chunks

============================================================
CHUNKS
============================================================

Chunk 1/5
────────────────────────────────────────
Search Intent: quick weeknight fish dinners
Size: 145 characters
Hash: a1b2c3d4e5f6g7h8...
Analysis: {"keywords": ["fish", "pie", "easy"], "difficulty": "medium"}

Text:
  Happy Fish Pie is a comforting family meal featuring white fish
  and salmon in a creamy sauce, topped with golden mashed potatoes.
  Perfect for weeknight dinners.

[... more chunks ...]

============================================================
STATISTICS
============================================================
Total chunks: 5
Average size: 132.4 characters
Min size: 87 characters
Max size: 201 characters

Search Intents (5):
  1. quick weeknight fish dinners
  2. family-friendly seafood recipes
  3. comfort food with fish
  4. easy fish pie recipe
  5. creamy baked fish dishes
```

## Features

- ✅ **No DB writes** (`no_db=True`)  
- ✅ **Readable terminal output** (ANSI colors)  
- ✅ **Useful stats**  
- ✅ **Any recipe PDF** PyMuPDF can open  
- ✅ **`--verbose`** for debugging  

## Notes

- Runs the full Llama pipeline; chunks exist only in memory / stdout  
- Good for validating parsing and chunking  
- PDFs must be readable by the extraction stack  

## Troubleshooting

### “Ollama not running” / timeout
```bash
ps aux | grep ollama
ollama serve
curl http://localhost:11434/api/tags

# If stuck, restart
pkill ollama
ollama serve
```

**Timeouts:** check CPU/RAM; try a smaller PDF (e.g. `tomato-mussel-pasta.pdf`); raise timeout in `recipe_pdf_agent_llama/ollama_client.py` (default 300s); try `llama3.2`.

### “Model llama3.1 not found”
```bash
ollama pull llama3.1
# or
ollama pull llama3.2
python tests/test_chunks.py --model llama3.2 --pdf path/to/file.pdf
```

### “PDF file not found”
```bash
ls -la data/processed_pdfs/
```

### `ModuleNotFoundError`
```bash
source .venv/bin/activate
```

### Hangs on Step 2
Expected — Llama is working; allow 2–5 minutes. Use `--verbose`:
```bash
python tests/test_chunks.py --pdf path/to/file.pdf --verbose
```
