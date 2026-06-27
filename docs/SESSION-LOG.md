# Session Log

Append-only running log of work sessions (newest on top). To resume cold: read
`CLAUDE.md` (operational brief), `PRD.md` (full spec), then the latest entry below.

---

## 2026-06-27 — Phase 1 context injection complete (ingest + query)

**HEAD at session end:** `93413b9` (this docs entry commits on top of it).

### Shipped + committed this session
- **MemoryMapService — real derivation** (commit `c318c64`): replaced the
  `memory-map` stub with a real per-vault derivation (`deriveMemoryMap`) that parses
  `raw/pages/` frontmatter + wikilinks into nodes/edges/orphans/danglingLinks.
  Deterministic + byte-identical rebuild (sorted, no timestamps; honors invariant 3).
  Lives in `@mneme/core` (value-imports `@mneme/wiki`); `@mneme/cache` stays a thin
  type-only contract. Accessors `getMemoryMap`/`toContextSummary` built. Added
  `vitest.config.ts` aliasing `@mneme/*` -> `src` (runtime value-import of unbuilt
  internal pkgs in tests).
- **Ingest memory-map injection** (commit `5ad725d`): the Host injects the
  existing-pages map (`toContextSummary`) into the ingest prompt so a new ingest links
  to existing pages by `[[slug]]` instead of duplicating. Map derived fresh from
  durable truth (no dependency on a non-rebuildable cache). Adapter untouched (Host
  owns the prompt); validation + path guards intact. Proven on real `claude -p` runs:
  organic edges resolve (Phase A), and an overlapping ingest links
  `[[spaced-repetition]]`/`[[active-recall]]` + resolves a dangling link WITHOUT a
  duplicate page (Phase B).
- **Query path — read-only vault routing + cited synthesis** (commit `93413b9`):
  `sendMessage` now answers from the vault. Route (memory-map title/tag/slug overlap
  + 1-hop edge neighbors, bounded `maxPages=6`, deterministic) -> load pages -> cited
  synthesis. Citations = wikilinks in the answer intersected with routed pages
  (always a subset). "Not in this vault." short-circuits with NO backend call.

### The firewall change (§-aware, agreed)
`AgentProvider` gained an **optional `runQuery?`**. Read-only is a **TYPE guarantee**,
not a convention: `QueryTask` has **no `workspace` and no permission field** (so the
backend is never given the vault path and has no knob to request edit permission),
and `QueryResult` has **no `proposedChanges`** (so a query cannot feed the
proposal/commit path). The `ClaudeCodeAdapter.runQuery` runs `claude -p` in
`os.tmpdir()` with `--permission-mode default` (never `acceptEdits`) and never calls
`captureChanges`. Invariant 2 intact — `runQuery` is a thin read executor (returns an
answer, never a proposal/commit), not one of the forbidden Host-service methods.

### Verified green
- `npm test` — **43/43**, offline, **$0** (backend mocked / spy provider).
- `npm run typecheck` — clean.
- `npm run dev:init` — StubAdapter ingest->gate->commit->rebuild pipeline passes.
- One real paid query — grounded cited answer; **sha256 before/after = zero files
  changed** (read-only verified). Session paid total ≈ **$2.05**.

### Milestone
PRD Phase 1 **"context injection" is now complete on BOTH sides** — ingest (link, do
not duplicate) and query (read-only cited synthesis).

### Open follow-ups (prioritized for a local single-user Windows tool)
- **NEXT (deferred deliberately): write-back.** When a query yields a durably
  valuable synthesis, propose it as a new page via the **existing ingest
  proposal+gate path** — NEVER auto-commit. This is the read->write firewall
  decision and needs design first: who/what judges "valuable", when to propose, and
  whether auto-judging is itself a self-improve trigger. Do this at session start
  with a fresh head, not mid-session.
- **Tracked (not blocking):**
  - Routing is **lexical** (title/tag/slug overlap) — it fails when a question's
    wording diverges from page titles. This is the concrete motivation for Phase 4
    search/embeddings.
  - Query answer is **single-shot** (no streaming); a `runQuery` streaming variant
    may be wanted later.
- **Still tracked from before:**
  - tests for `approveProposal` conflict -> `needsRegenerate` (highest-risk untested
    path);
  - nested-page slug collision policy;
  - retire `scripts/dev-frontmatter.ts` (superseded by `frontmatter.test.ts`).

### How to resume (cold start)
1. Read `CLAUDE.md` and `PRD.md`.
2. Read the latest entry in this file.
3. Next goal = **write-back** (design it first, fresh head).

---

## 2026-06-21 — Phase 1 ingest: real run + Host-side guards + cheap auth

**HEAD at session end:** `d3c2576` (this docs entry commits on top of it).

### Shipped this session
- **Real `claude -p` ingest** — the Host owns the instruction builder
  (`packages/core/src/ingest/instruction.ts`), which drives the backend to write
  exactly ONE schema-conforming `raw/pages/<slug>.md`. The run happens in an
  isolated git worktree and is captured as a PROPOSAL (the Host commits, never the
  provider). Commit `b02f5e3`.
- **Two Host-side guards (do not trust the model):**
  - path allowlist rejecting any captured change outside `raw/pages/`, including
    `..` traversal and win32 backslash forms (`packages/core/src/ingest/paths.ts`);
  - UTC-midnight date coercion at the parse boundary — unquoted YAML dates coerce
    to `"YYYY-MM-DD"`, datetime+offset is rejected (no silent day-shift)
    (`packages/wiki/src/frontmatter.ts`). Commit `b02f5e3`.
- **`ProposalFlagged` event** — distinct signal when a guard forces a proposal to
  draft; `PolicyDowngraded` stays reserved for the §1.10 downgrade ladder. `b02f5e3`.
- **Memoized delegated auth probe** — `authenticate()` memoizes the probe promise
  (set synchronously before any await) -> at most ONE billed `claude -p` per
  process, race-safe and poisoning-proof. Confirmed no non-billed CLI auth check
  exists (`claude` exposes only doctor/mcp/setup-token). Commit `d3c2576`.
- **20 offline unit tests** (vitest, `npm test`) locking the path guard, the date
  contract, and the auth caching. Commit `d3c2576`.
- Housekeeping: dropped `--bare` from `claude -p` (it bypasses the delegated OAuth
  session — root cause of the earlier false "Not logged in") in `b02f5e3`;
  gitignored `tsconfig.tsbuildinfo` in `628ef08`.

### Verified green
- `npm test` — 20/20, **$0** (hermetic: probe overridden / CLI seams mocked).
- `npm run typecheck` — clean.
- `npm run dev:init` — StubAdapter pipeline passes (validation ok, pathGuard ok,
  approve -> commit -> rebuild).
- One real `npm run dev:ingest` — **$0.45**, produced a schema-valid
  `raw/pages/spaced-repetition.md` delivered as a review-mode proposal (not
  auto-committed).

### Scope decision (owner, 2026-06-21)
Primary target is a **local single-user Windows PC** (Electron client + local Core
over stdio). Remote clients / server hosting (PRD §2 HTTP/WS Auth Gateway, §8
Phase 4) are **deferred**; ingest isolation is low-stakes on a single-user
own-machine setup. Mirrored as an additive note near the top of `PRD.md`.

### Open follow-ups (prioritized for a local desktop tool)
- **NEXT: MemoryMapService** (PRD Phase 1) — real per-vault derivation from pages +
  wikilinks + frontmatter, injected as query context. First large-scale consumer of
  frontmatter parsing.
- **Deferred (low stakes on local single-user PC):** ingest isolation / hermetic
  nested run (scope the non-`--bare` run away from global plugins/CLAUDE.md).
- **Tracked:**
  - tests for the `approveProposal` conflict -> `needsRegenerate` (rebase-conflict)
    path — highest-risk untested code;
  - `resetAuthCache()` for any long-running Core — low priority on a local desktop
    that restarts;
  - retire `scripts/dev-frontmatter.ts` (superseded by `frontmatter.test.ts`).

### How to resume (cold start)
1. Read `CLAUDE.md` and `PRD.md` (incl. the new Deployment-scope note).
2. Read the latest entry in this file.
3. Next goal = **MemoryMapService** (PRD Phase 1).
