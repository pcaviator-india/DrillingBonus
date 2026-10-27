# `src/lib/ai/` — NVIDIA AI advisory layer

Plain-fetch client for NVIDIA's hosted NIM API (OpenAI-compatible,
`https://integrate.api.nvidia.com/v1`). No new dependencies.

## Hard rules (do not violate — see `.clinerules`)

1. **Never imported by the bonus engine or calculations.** The engine stays
   pure and deterministic; AI never computes money amounts.
2. AI **suggests, explains, ranks** — a human approves before anything is
   stored. AI-derived records must carry provenance (`source: "ai"`, model
   used) once persistence is added.
3. **Server-side only.** The API key must never reach client components.
4. If `NVIDIA_API_KEY` is missing, callers must degrade gracefully
   (`isAiEnabled()` guard), never crash a page or a job.

## Files

| File | Purpose |
|---|---|
| `config.ts` | Env-driven config (`NVIDIA_API_KEY`, optional `NVIDIA_BASE_URL`, `NVIDIA_CHAT_MODEL`, `NVIDIA_EMBED_MODEL`, `NVIDIA_TIMEOUT_MS`) |
| `client.ts` | `aiChat`, `aiEmbed`, `aiPing` with timeouts, no caching |
| `types.ts` | Request/response types |
| `suggest.ts` | **Phase A (wired):** embedding ranker + `suggestRigMatches` / `suggestSiteMatches` / `suggestPositionMatches`. Read-only; thresholds 0.55 (review) / 0.85 (high) |
| `index.ts` | Barrel exports |

## Phase A status: wired ✅ (2026-10-14)

- **Reconciliation → Drilling matching:** each unmapped MAQUINA row has an
  "✨ AI" button → ranked rigs as clickable score chips; clicking pre-fills the
  select, the admin still presses Save (`mapMachineToRigAction` unchanged).
- **Positions page:** "✨ AI" on both the review rows and the classify dialog;
  high-confidence hits are ✅, plausible ones 🟡. Review-row chips link with
  one click (same pattern as the existing manual buttons).

Server actions: `aiSuggestRigMatchesAction` (reconciliation/actions.ts),
`aiSuggestMainPositionsAction` (positions/actions.ts). Both are role-gated and
return `[]` silently when NVIDIA is not configured.

## Verification

Run `npx tsx scripts/ai-probe.ts` — separate process, safe during syncs.
It checks chat reachability and that embeddings order role-name similarity
correctly (the signal Phase A fuzzy matching depends on).

Note: `.env` is read at server start, so routes inside the running dev server
won't see the key until the next restart — the probe works immediately since
it loads `.env` itself.

## Planned phases (proposal)

- **A — Fuzzy matching suggester:** embeddings rank unmatched employee/site/rig
  names against aliases; human confirms in the matching UI.
- **B — Explanations:** natural-language narratives for reconciliation
  mismatches and planilla-vs-system comparisons, run via the existing job
  system.
- **C — NL chat over results:** tool-calling against Prisma (deterministic
  queries; the model never invents numbers).
