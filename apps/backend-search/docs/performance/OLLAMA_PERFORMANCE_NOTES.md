# Ollama performance notes

## Current situation

`test_chunks.py` is **functionally complete**. Ollama can still take a long time on PDFs with large, complex prompts.

### What we checked

✅ Ollama process running  
✅ `llama3.1` available via API  
✅ HTTP connectivity (`curl` works)  
❌ Long runs — big prompts can exceed 5 minutes  

## Why it is slow

1. **Three LLM calls per PDF:** `understand_recipe()`, `build_joav0_json()`, `build_intelligent_chunks()`.  
2. **Large context:** PDFs with 1500+ characters → long prompts.  
3. **Hardware:** Llama 3.1 8B wants ~8GB RAM and a strong CPU/GPU for snappy replies.  

## Mitigations

### 1. Increase timeout

```python
# recipe_pdf_agent_llama/ollama_client.py
@dataclass(frozen=True)
class OllamaConfig:
    base_url: str
    model: str
    timeout_s: float = 600.0  # 10 minutes
```

### 2. Smaller / faster model

```bash
ollama pull llama3.2
python tests/test_chunks.py --model llama3.2 --pdf data/processed_pdfs/tomato-mussel-pasta.pdf
```

### 3. Smaller PDFs first

```bash
python tests/test_chunks.py --pdf data/processed_pdfs/tomato-mussel-pasta.pdf   # ~36KB
python tests/test_chunks.py --pdf data/processed_pdfs/smoked-salmon-pasta-jamie-oliver-recipes.pdf  # ~46KB
python tests/test_chunks.py --pdf data/processed_pdfs/happy-fish-pie.pdf  # ~50KB
```

### 4. Restart Ollama

```bash
pkill ollama
ollama serve
top -o cpu
```

### 5. More aggressive quantization

```bash
ollama pull llama3.1:q4_K_S
python tests/test_chunks.py --model llama3.1:q4_K_S --pdf path/to/file.pdf
```

## Quick sanity check

```bash
curl -X POST http://localhost:11434/api/chat \
  -d '{"model":"llama3.1","stream":false,"messages":[{"role":"user","content":"Say OK"}]}' \
  -H "Content-Type: application/json" \
  --max-time 60
```

If this returns in &lt;10s, Ollama is fine; slowness is prompt size / pipeline cost.

## Recommendation for quick validation

1. Use `llama3.2`  
2. Use `tomato-mussel-pasta.pdf`  
3. Expect ~2–3 minutes per heavy step  

```bash
python tests/test_chunks.py \
  --model llama3.2 \
  --pdf data/processed_pdfs/tomato-mussel-pasta.pdf
```

## Monitoring

```bash
tail -f ~/.ollama/logs/server.log
watch -n 1 'ps aux | grep ollama | grep -v grep'
python tests/test_chunks.py --pdf path/to/file.pdf
```
