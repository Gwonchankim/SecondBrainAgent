# Mneme — Phase 0 scaffold

Host-owned self-improving knowledge orchestrator. This is the **Phase 0
skeleton**: the contracts compile, the proposal/commit pipeline runs headless,
and the Electron shell is wired (build separately). See `PRD` for the full design.

## What's here (maps to PRD Phase 0 scope)

| Scope item | Where |
|---|---|
| Headless Core | `packages/core` (`MnemeCore`, `bin.ts`) |
| Local IPC boundary | `packages/ipc` (stdio JSON-RPC; transport-swappable) |
| AgentProvider interface | `packages/provider` (thin contract — the firewall) |
| ClaudeCodeAdapter stub | `packages/core/src/adapters/claude-code-adapter.ts` |
| WikiService + Git proposal branch model | `packages/wiki/src/wiki-service.ts` |
| Vault skeleton | `packages/wiki/src/vault.ts` |
| .cache rebuild contract | `packages/cache` |
| CredentialStore abstraction | `packages/credential` (Windows first) |
| Minimal Electron chat shell | `apps/desktop` |

## Locked scaffold decisions
- Naming: codename **Mneme**, packages `@mneme/*`.
- Frontmatter minimal schema: `type · title · tags · sources · created · updated · vault` (zod-enforced).
- Credentials: Windows Credential Manager first via `@napi-rs/keyring`.

## Auth model (two tracks)
Providers declare `authModes`. Auth is split to keep subscription use compliant:

- **delegated** — the backend CLI (`claude`, `codex`) owns the OAuth session.
  The Host never holds or routes the token; it only invokes the CLI. This is the
  only use of subscription OAuth permitted by Anthropic/OpenAI terms.
  `authenticate()` here is a real CLI probe (binary present? session present?),
  surfacing a `loginHint` (e.g. `claude`, `codex login`) when not logged in.
- **api-key** — the Host stores the key in `CredentialStore` (Core-only, never
  exposed to a client) and injects it at call time. Vendor-recommended for
  unattended/programmatic use.

```bash
npx ts-node scripts/dev-auth.ts   # runs the REAL authenticate() probe for both adapters
```

## Real headless run + diff capture
`ClaudeCodeAdapter.runTask()` is a real headless run: it invokes
`claude -p "<prompt>" --output-format json --permission-mode acceptEdits`.
(No `--bare`: that flag suppresses the delegated OAuth subscription session, so a
subscription login would falsely report "Not logged in". `authenticate()` likewise
ATTEMPTs a real minimal run rather than probing files — the reliable check on Windows.)

The constraint that drives the design: `claude -p` physically edits files in the
working tree, but a provider must only ever return a *proposal* (invariant 6).
So the run happens inside an **isolated detached git worktree** checked out at the
vault's HEAD (`packages/core/src/adapters/worktree-capture.ts`). The agent edits
there, we capture the file changes (A/M/D) as `ProposedFileChange[]`, and tear the
worktree down — the vault's own working tree is never touched. The Host then lands
those changes on a `proposal/<id>` branch and gates them as usual.

This `captureChanges()` util generalizes the `diffCapture` capability: any backend
that edits files in a scoped workspace (Codex, Hermes, Antigravity) plugs into the
same mechanism. `scripts/dev-capture.ts` proves it with a fake agent (no `claude`
needed) — verifying the capture is correct and the main tree stays clean.

```bash
npx ts-node scripts/dev-capture.ts   # proves worktree isolation + capture + teardown
```

## Real ingest (Host-built instruction -> real page)
Ingest is truth-split: the raw source is committed immediately (immutable input),
then page integration runs as a gated proposal. The **Host** builds the instruction
that drives the backend — it injects the frontmatter schema, the raw source id, and
the vault id, and tells the backend to write exactly one page under `raw/pages/`
(`packages/core/src/ingest/instruction.ts`). The adapter stays thin: it only runs
the prompt. After capture, the Host runs two guards that do NOT trust the model:
frontmatter validation against `PageFrontmatterSchema`
(`packages/core/src/ingest/validate.ts`) and a `raw/pages/` path allowlist
(`packages/core/src/ingest/paths.ts`). A page that fails either is forced to draft,
never auto-committed, and surfaced via a `ProposalFlagged` event. The frontmatter
schema coerces YAML dates to `"YYYY-MM-DD"` strings, so an unquoted date from the
backend still validates (`npm run dev:frontmatter` proves this).

```bash
npm run dev:ingest        # real claude -p ingest -> schema-validated page, delivered as a proposal
npm run dev:frontmatter   # proves unquoted-date frontmatter coerces + validates
```

`dev:ingest` needs the `claude` CLI on PATH and a logged-in session; it runs in
`reflect: review` so the page lands as a proposal (not auto-committed) and prints the
generated page, validation verdict, total_cost_usd, and diff.

## Dev

```bash
npm install
npm run typecheck            # type-checks all packages
npx ts-node scripts/dev-init.ts   # headless smoke test of the pipeline
```

The Electron app (`apps/desktop`) is excluded from the root typecheck and built
separately (`npm -w @mneme/desktop run build`), since it needs the Electron + DOM
toolchain.

## Boundaries this scaffold enforces
- Providers return proposals only; the Host commits.
- `raw/` direct files are immutable; pages land via proposal branches.
- Derived caches are wipe-and-rebuild; never a source of truth.
- Vaults are isolated git repos with their own policy + budget.
