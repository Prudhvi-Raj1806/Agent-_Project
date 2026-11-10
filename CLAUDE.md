Read `docs/ARCHITECTURE.md` before making any design decision in this repo — it is the authoritative "JARVIS Architecture v2" doc (not a summary; exported verbatim, rev 38, 2026-10-18). It governs:

- what JARVIS owns vs. delegates vs. integrates (§2)
- the adapter pattern for runtimes, models, decision models, tools, and skills (§15, §17) — the whole reason `src/server/hermes/`, `src/server/laya/`, and `src/server/omnirouter/` are shaped the way they are
- the real Hermes Agent `api_server` wire contract (§3, §18) — `src/server/hermes/agent-adapter.ts` targets it directly; `src/server/hermes/mock-adapter.ts` is the only other adapter (no bespoke invented contract exists anymore — it was deleted 2026-10-18)
- known ecosystem gotchas already priced into the code (§18) — e.g. Hermes's session-continuity story is unconfirmed, so `orchestrator.ts` folds prior mission context into the prompt on every resumed run rather than trusting a resume primitive
- the MVP build order (§14) — don't add OpenClaw, voice, or anything past the current slice without checking whether the doc's build order has actually reached that point

This repo (`jarvis-ui`, Next.js/TypeScript) is the active JARVIS build as of 2026-10-18 — a prior, separate Python rebuild (`Rex`) was abandoned in favor of reworking this one in place. If something in this codebase contradicts the doc, the doc wins unless Raj says otherwise — flag the contradiction rather than silently resolving it either way.

**Naming (decided 2026-11-10):** the product name for this system is **RAJ**; "JARVIS" is the working/codename used throughout the architecture doc and the code. Internal identifiers (`jarvis-ui`, `jarvis` package/env/DB names, doc section titles) are deliberately NOT renamed yet — churn with no benefit before production. In user-facing copy (UI strings, README title, docs prose you write) say RAJ. Note the collision: "Raj" is also the owner's name, and the doc/this file use it that way ("unless Raj says otherwise") — in new writing, say "the owner" for the person and "RAJ" for the system so the two can't be confused.

@AGENTS.md
