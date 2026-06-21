---
title: SecondBrainAgent (Mneme) — PRD
version: 0.2 (Phase 0 built)
status: Phase 0 scaffold complete — typecheck clean, pipelines runnable
owner: 권찬
updated: 2026-06-21
note: Single source of design truth. Markdown, Git-tracked. CLAUDE.md is the short operational brief for the Claude CLI agent; this file is the full spec.
---

# SecondBrainAgent (codename **Mneme**) — PRD v0.2

> Project folder: `C:\Users\amole\Desktop\SecondBrainAgent`. Package scope: `@mneme/*`.
> Folder name and codename can differ freely; rename later if desired.

---

## 0. Identity (center sentence)

> **이 제품은 Hermes 같은 특정 런타임을 확장한 앱이 아니라, 여러 agent runtime을 실행기로 쓰는 host-owned self-improving knowledge orchestrator다.**

The self-improving loop (identity, memory policy, review, routing, budget, parallel
policy) lives in the **Host**. Backends (Claude Code, Codex, Hermes, Antigravity)
are **interchangeable executors** that return PROPOSED changes only — never commit.

```
Host Orchestrator  = identity, memory policy, self-improve loop, review, routing, budget, parallel policy
Provider Adapter   = task execution, file ops, tool runs, diff/result return
Second Brain Wiki  = single source of truth for long-term knowledge (Markdown + raw, in Git)
Native Memory      = derived cache (wiki map, paths, prefs, ops state)
```

---

## 1. Locked invariants (the constitution — do not change without explicit agreement)

1. The only durable truth is the **Markdown Wiki + raw sources, in Git**.
2. Native memory map / graph index / search index are **rebuildable derivations**.
3. Deleting `.cache/` then `rebuild` must always succeed.
4. Auth tokens / provider config / vault policy are **operational, not knowledge** → OS credential store, never in the wiki.
5. The **Headless Core owns the self-improving loop**.
6. A **Provider is an executor only**; its output is a *proposal*, never a direct commit.
7. A **proposal is a Git branch** off a base commit; approval re-validates (clean merge / rebase / conflict→reject-and-regenerate).
8. Parallel mode: **Off / Ask / Auto**.
9. Reflect mode: **Draft / Review / Auto**.
10. Automation **downgrades only** (never auto-upgrades): capability-unsupported → budget-exceeded → vault-default.
11. **Vault = hard isolation boundary** (links, graph, memory map, policy, review, budget all vault-internal).
12. **Budget:** per-run cap + per-vault daily/monthly cap + global monthly hard cap. Work/personal costs separated. Overage downgrades Auto-parallel → Ask; no upgrade to a pricier run without approval.

### Auth model (added v0.2 — a compliance boundary, not just a design choice)
- **delegated** — the backend CLI (`claude`, `codex`) owns the OAuth subscription session. The Host never holds or routes the token; it only invokes the CLI. This is the **only** use of subscription OAuth permitted by Anthropic/OpenAI terms.
- **api-key** — the Host stores the key in `CredentialStore` (Core-only, never exposed to a client) and injects it at call time. Vendor-recommended for unattended/programmatic use.
- Rule of thumb: personal/host-owned Mneme invoking *your own* logged-in CLI = fine. The moment it routes other users' requests on subscription tokens, or extracts a token to hit the API directly → must use API keys.

---

## 2. Architecture (4-tier + truth source)

```
[ Clients ]      Desktop (Electron, MVP)  /  Telegram·Web (Phase 4)
      |
   API edge      MVP: local IPC only  /  Phase 4: + HTTP·WS·Auth Gateway
      |
[ Headless Core ]  orchestrator, owns self-improve loop   <──>  [ Wiki + Git ] truth
      |
[ Provider Adapter ]  thin, unified contract
      |
[ Backends ]     Claude Code(1) · Codex(2) · Hermes(adapter, loop disabled) · Antigravity(remote worker)
```

**Host services:** ProviderRegistry · SkillService · MemoryMapService · WikiService · GraphService · ReviewGateService · BudgetRouter · ParallelPolicyEngine · DreamSequenceService · IngestService · CredentialStore.

**Thin AgentProvider contract** (the firewall — must NEVER grow `improveSelf` / `writeMemory` / `scheduleNudge` / `createSkill`):
`getCapabilities · authenticate · runTask · streamTask? · cancelRun`.

---

## 3. Memory model (2 layers)

| Layer | What | Role | Persistence |
|---|---|---|---|
| Native Memory | structure map derived from the wiki | "do I know X, where is it, what links to it" → routing | derived cache (rebuildable) |
| Second Brain Wiki | content pages in `raw/pages/` | the actual content (on-demand load) | source of truth (Git) |

Native memory is **derived from the wiki, not written separately** (avoids drift), and is **per-vault** (privacy + context budget).

---

## 4. Core API + events

**CoreApi:** `sendMessage · ingestSource · proposeWikiChange · approveChange · rejectChange · runDreamSequence · getGraph · getVaults · updatePolicy` (+ event stream).

**Events:** `AgentStarted · AgentEvent · DiffReady · ApprovalRequired · WikiCommitted · IndexRebuilt · BudgetLimitReached · PolicyDowngraded`.

---

## 5. Key data flows

**Ingest (truth-split):** raw save = immediate commit (immutable input, no gate) → page integration = proposal → gate.
**Query:** memory map routes → load pages → cited synthesis → (if valuable) write-back proposal → gate.
**Dream:** scheduled lint/synthesis → batched proposals (work) or auto (personal).
**Approval-with-concurrency:** proposal branch off base; on approve, if base moved → rebase; conflict → reject-and-regenerate.

**Worktree capture (added v0.2):** a backend like `claude -p` physically edits the working tree, but invariant 6 forbids the provider committing. So the run happens in an **isolated detached git worktree off HEAD**; we capture the file changes (A/M/D) as a proposal and tear the worktree down — the vault's own working tree is never touched. This `captureChanges()` util generalizes the `diffCapture` capability across all file-editing backends (Codex, Hermes, Antigravity).

---

## 6. Repo layout (the scaffold)

```
SecondBrainAgent/                 # monorepo root (= this project folder)
  package.json                    # npm workspaces; dev scripts
  tsconfig.base.json / tsconfig.json
  .editorconfig / .gitattributes  # UTF-8, LF enforced
  PRD.md  CLAUDE.md  GETTING-STARTED.md  README.md
  workspace-template/ORCHESTRATOR.md   # seed for a runtime workspace's operating manual
  packages/
    provider/    @mneme/provider    thin AgentProvider contract + auth model (the firewall)
    ipc/         @mneme/ipc         CoreApi + events + stdio JSON-RPC (transport-swappable)
    wiki/        @mneme/wiki        frontmatter (zod) + vault skeleton + WikiService (Git proposal branches)
    credential/  @mneme/credential  CredentialStore (Windows Credential Manager via @napi-rs/keyring)
    cache/       @mneme/cache       .cache rebuild contract + stub derivations
    core/        @mneme/core        MnemeCore (CoreApi impl) + policies + adapters
      adapters/  claude-code-adapter · codex-adapter · stub-adapter · cli-probe · worktree-capture
  apps/desktop/  @mneme/desktop     minimal Electron chat shell (built separately)
  scripts/       dev-init · dev-auth · dev-capture
```

### Vault layout (created at runtime, each its own Git repo)
```
<workspace>/vaults/<id>/
  raw/                 immutable input (raw/ direct files never edited)
    pages/             LLM-maintained content pages (Git-tracked)
    session-notes/  assets/
  wiki/                index.md · log.md · processed.md  (only these three)
  .cache/              derived, gitignored, rebuildable
```

### Frontmatter (minimal, zod-enforced)
```yaml
type: topic | entity | synthesis | source-summary
title: string
tags: [string]
sources: [string]   # raw source-ids
created: YYYY-MM-DD
updated: YYYY-MM-DD
vault: string
```
Wikilinks are filename-based (Obsidian-compatible), resolved vault-internally only.

---

## 7. Current status — what is BUILT (Phase 0)

- Monorepo compiles clean (`npm run typecheck`, 0 errors).
- **WikiService proposal-branch model** works: raw immediate-commit, page proposal branch, approve = merge / rebase / regenerate. Proven by `dev-init` (raw committed → proposal pending → ApprovalRequired → explicit approve → merge → cache rebuilt).
- **Auth is real, two-track**: `authenticate()` shells out and reports true state. `dev-auth` shows delegated (binary/login probe) and api-key (env/CredentialStore) for both `claude-code` and `codex`.
- **runTask is real** for Claude Code: `claude -p --bare --output-format json --permission-mode acceptEdits` inside an isolated worktree, capturing file changes as a proposal. `dev-capture` proves the capture + that the vault working tree stays untouched.
- `.cache` rebuild contract works (wipe + rebuild, 3 stub derivations).
- CredentialStore abstraction with a Windows backend; secrets are Core-only.
- Electron shell scaffolded (main spawns Core child, stdio bridge) — not yet wired end-to-end.

Still stub / not done: real ingest/query prompt engineering, MemoryMapService, GraphService (real derivations), BudgetRouter persistence, DreamSequenceService, Electron↔Core live wiring, Codex `runTask`.

---

## 8. Roadmap

| Phase | Goal | Key deliverables | State |
|---|---|---|---|
| **0 — skeleton/contracts** | Core, adapter, Git truth, real auth + run | Headless Core + local IPC, AgentProvider, ClaudeCodeAdapter (real auth + run), WikiService+Git, .cache rebuild, CredentialStore, Electron shell | **mostly done** |
| **1 — Second Brain core** | ingest · query · review working for real | Ingest instruction builder (Host injects schema/context), real `claude -p` page integration, Approval gate UX, index/log/processed updates, MemoryMapService (real derivation) + context injection, Query with citations + write-back | next |
| **2 — graph · policy · multi-vault** | visibility · isolation · control | GraphService (real) + graph view, multi-vault hard isolation + per-vault policy/budget, BudgetRouter (persistent), ParallelPolicyEngine + subagents (capability-gated) | |
| **3 — Dream · 2nd adapter** | self-maintenance · backend expansion | DreamSequenceService + scheduler, Codex `runTask`, low-cost routing for ingest/lint | |
| **4 — remote · expansion** | clients · backends | HTTP/WS Auth Gateway (Telegram/web), Hermes adapter (loop-disabled), Antigravity remote worker, search engine (BM25/embedding) | |

---

## 9. Open decisions (close as constraints reveal them — do NOT pre-decide by imagination)

- Product/folder naming finalization (folder `SecondBrainAgent` vs codename `Mneme`).
- Ingest/query instruction templates (how the Host phrases the task + injects frontmatter schema + relevant context into `claude -p`).
- Search engine choice (qmd / BM25 / embedding) — Phase 4; index stays regenerable from day 1.
- Page taxonomy (type) authoring rules + MOC conventions.
- Dream digest review UX (batched approval screen for work vault).
- Rebase-conflict regeneration prompt strategy.
- Antigravity capability — **half-closed**: the worktree-capture mechanism is generic, so the only open question is "can it be scoped to a dir + run headless?" (a per-backend `--version`/status probe when wiring that adapter).
- frontmatter `id` field (stable id vs filename-as-id) — decide if/when renames break links.

---

*v0.2 baseline. Changes tracked via Git. The locked invariants (§1) are not modified without explicit agreement.*
