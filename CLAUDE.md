# CLAUDE.md — working brief for the Claude CLI agent

You are working **on** SecondBrainAgent (codename **Mneme**), a TypeScript
monorepo. This file is your short operational brief; `PRD.md` is the full spec —
read it when you need design rationale.

> Two different roles use the word "Claude Code" here. THIS file is for role (A):
> Claude Code as the **dev tool building Mneme**. Do not confuse it with role (B):
> the `ClaudeCodeAdapter`, which is Mneme invoking `claude -p` at runtime to work
> on vaults. You are (A). You implement (B); you are not (B).

## Identity of the product you're building
Host-owned self-improving knowledge orchestrator. The self-improving loop lives
in the **Host (Core)**. Backends are **interchangeable thin executors** that
return PROPOSED changes only — they never commit. Keep that firewall intact.

## Hard rules (never violate when editing)
1. The only durable truth is the Markdown Wiki + raw sources, in Git. Everything
   in `.cache/` is a rebuildable derivation; never treat it as truth, never track it.
2. A Provider returns a **proposal**, never a commit. Do not add commit/write-truth
   logic to any adapter. The `AgentProvider` interface must NEVER gain
   `improveSelf` / `writeMemory` / `scheduleNudge` / `createSkill`.
3. `raw/` direct files are immutable input. Content pages live in `raw/pages/`.
   `wiki/` holds exactly three files: `index.md`, `log.md`, `processed.md`.
4. Secrets/config are operational, not knowledge. They go to the OS credential
   store via `@mneme/credential`. Never write a secret into a vault, the repo, a
   prompt, or a log.
5. Vault = hard isolation boundary. Links/graph/memory/policy/budget are
   vault-internal. Do not let one vault read another.
6. A file-editing backend must run through `captureChanges()` (worktree isolation)
   so the real working tree is never mutated by a provider run.

## Conventions
- All code comments in **English**. Files are **UTF-8 + LF** (`.editorconfig`,
  `.gitattributes` enforce this — Korean in source previously rendered broken in
  some terminals, so keep source ASCII/English).
- Page frontmatter is zod-enforced: `type · title · tags · sources · created ·
  updated · vault`. Validate before persisting (`@mneme/wiki/frontmatter`).
- Wikilinks are filename-based (Obsidian-compatible), resolved vault-internally.
- TypeScript, CommonJS, strict. Internal packages import via `@mneme/*`.

## Repo map
```
packages/provider   thin AgentProvider contract + auth model (the firewall)
packages/ipc        CoreApi + events + stdio JSON-RPC (transport-swappable)
packages/wiki       frontmatter, vault skeleton, WikiService (Git proposal branches)
packages/credential CredentialStore (Windows Credential Manager first)
packages/cache      .cache rebuild contract + stub derivations
packages/core       MnemeCore (CoreApi) + policies + adapters/
apps/desktop        minimal Electron chat shell (built separately)
scripts/            dev-init · dev-auth · dev-capture
```

## Verify-as-you-go (run after changes)
```
npm run typecheck     # must stay 0 errors
npm run dev:capture   # worktree capture mechanism (no claude needed)
npm run dev:init      # ingest -> proposal -> gate -> commit -> rebuild pipeline
npm run dev:auth      # real authenticate() probe for claude-code + codex
```

## Current status (Phase 0, mostly done)
Contracts compile; WikiService proposal-branch model works; `authenticate()` is
real and two-track (delegated / api-key); `ClaudeCodeAdapter.runTask()` is real
(`claude -p` in an isolated worktree, captures a proposal); `.cache` rebuild
works. Electron shell is scaffolded but not yet wired Core↔renderer.

## Next tasks (pick up from here — see PRD §8 Phase 1)
1. **Ingest instruction builder** — the Host phrasing that tells `claude -p` to
   integrate a raw source into a `raw/pages/` page that conforms to the frontmatter
   schema, with the right context injected. (Keeps adapters thin: the Host owns
   the prompt, the adapter just runs it.)
2. **MemoryMapService** — replace the stub derivation: parse pages + wikilinks +
   frontmatter into a compact per-vault map, and inject it as query context.
3. **Electron ↔ Core live wiring** — make the chat shell drive
   sendMessage/ingest/approve over the existing stdio bridge and render events.
4. **GraphService** — real `graph-index` derivation from wikilinks + frontmatter
   + sources.

When you add a new backend, implement `AgentProvider` only, reuse `captureChanges`
and `probeCli`, and register it in `packages/core/src/bin.ts`. Nothing else.
