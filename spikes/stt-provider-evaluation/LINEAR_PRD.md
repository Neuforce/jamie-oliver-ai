## Spike: STT provider & model evaluation (NEU-643 Finding E)

**Parent context:** [NEU-643](https://linear.app/neuforce/issue/NEU-643) — voice transcript fidelity (user speaks **X**, UI shows **Y**, Jamie responds about **Y**).

**Approach track:** **E** — evaluate better STT / alternate provider (generic; no domain keyterm lists).

---

## Problem

Voice discovery (`/ws/chat-voice`) and cook mode (`backend-voice`) use Deepgram live STT. Users see a user bubble that is the STT output, not what they literally said. Conversation quality can remain good while **display fidelity** is poor.

NEU-643 implements **generic** mitigations first (buffer join fix, Deepgram live tuning: model, endpointing, punctuate, numerals). This spike decides whether a **provider/model change** is warranted.

---

## Goals

1. Benchmark transcript **word error rate / perceived fidelity** on a fixed Jamie voice test set (EN, mobile + desktop).
2. Compare at minimum Deepgram nova-3 (current) vs 1–2 alternatives (e.g. Deepgram flux, OpenAI Whisper realtime/batch, AssemblyAI — TBD by cost/latency).
3. Measure **latency** (transcript_final → brain) and **cost** per minute at prod volume assumptions.
4. Deliver a **recommendation**: stay on Deepgram + tuning vs migrate vs hybrid.

---

## Non-goals

- Domain **keyterm** / custom vocabulary lists per recipe or brand phrase.
- LLM post-correction of transcripts before display (separate decision).
- UX-only “approximate transcript” copy (can parallel; not this spike).

---

## Test set (draft)

| ID | Utterance type | Example |
| -- | -- | -- |
| T1 | Book / proper noun | “What's one of your best recipes from the 7 Ways book?” |
| T2 | Recipe name | “Show me the chicken pot pie recipe” |
| T3 | Long conversational | 20–30s multi-clause question |
| T4 | Noisy mobile | Same as T1, recorded on phone Safari |
| T5 | Barge-in / restart | User corrects mid-sentence |

Record **ground-truth X** manually; score **Y** from each provider.

---

## Success criteria

- [ ] Matrix doc: provider × model × WER/perceived score × p95 latency × $/min
- [ ] Recommendation with migration effort (S/M/L) for `ccai` + both backends
- [ ] Go/no-go for implementation ticket(s) linked from NEU-643

---

## Deliverables

1. `spikes/stt-provider-evaluation/` — scripts, sample audio, results JSON (repo)
2. Summary comment on NEU-643 with link to this issue
3. Follow-up implementation ticket(s) if go

---

## References

- `packages/ccai/ccai/core/speech_to_text/stt_deepgram.py`
- `apps/backend-search/recipe_search_agent/voice_handler.py`
- `apps/backend-voice/src/services/assistant_factory.py`
