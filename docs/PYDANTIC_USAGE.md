# Pydantic in jamie-oliver-ai — by stack

1. **FastAPI** — Pydantic (`BaseModel`, `Field`) for requests and responses.
2. **`packages/ccai`** — Pydantic for assistant core models.
3. **LangChain** — Pydantic (`PydanticOutputParser` + `BaseModel` models).

```mermaid
flowchart TB
  A["FastAPI + Pydantic"]
  B["ccai + Pydantic"]
  C["LangChain + Pydantic"]
```
