# Jamie Oliver AI Agent Guide

## Engineering principles

The canonical machine-applied version of these principles lives in `.cursor/rules/engineering-principles.mdc`.

- Name each invariant and assign exactly one owning component. Do not split ownership across layers.
- Keep one source of truth per fact; do not duplicate authoritative state (especially money, ledger, auth, or access).
- Never trust client-side decisions for money, authorization, or access; enforce trust-sensitive decisions at signed/server boundaries.
- Prefer foundational fixes over workarounds. If a temporary shim is unavoidable, label it clearly and track the follow-up that removes it.
- Every change must hold or reduce net complexity; remove dead or duplicate paths you touch.
- Self-check before finishing: does this raise the bar or just patch symptoms, and what invariant with single ownership/source of truth did this change enforce?
