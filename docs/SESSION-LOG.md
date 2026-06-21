# Session Log

Append-only running log of work sessions (newest on top). To resume cold: read
`CLAUDE.md` (operational brief), `PRD.md` (full spec), then the latest entry below.

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
