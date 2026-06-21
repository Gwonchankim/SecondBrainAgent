# ORCHESTRATOR.md — Mneme operating manual (seed)

This file lives at the WORKSPACE ROOT, one level above `vaults/`. It is the
human- and Host-readable contract. The Host injects context into provider tasks;
providers are NOT expected to auto-load this file (keeps adapters thin).

## Identity
Mneme is a host-owned self-improving knowledge orchestrator. The self-improving
loop lives in the Host. Backends (Claude Code, Codex, Hermes, Antigravity) are
interchangeable executors that only ever return PROPOSED changes.

## Invariants (do not change without explicit agreement)
1. The only durable truth is the Markdown Wiki + raw sources, in Git.
2. memory-map / graph-index / search-index are rebuildable derivations.
3. Deleting `.cache/` then rebuilding must always succeed.
4. Secrets and config are operational, not knowledge — OS credential store.
5. Provider output is a proposal, never a direct commit.
6. A proposal is a Git branch off a base commit; approval re-validates.
7. Vault = hard isolation boundary (links, graph, memory, policy, budget).

## Layout
```
workspace/
  ORCHESTRATOR.md
  config/        (policy, providers — secrets via OS store)
  core-state/    (pending-proposal metadata, run logs)
  vaults/<id>/   (each its own git repo)
    raw/           immutable input (raw/ direct files never edited)
      pages/       LLM-maintained content pages
      session-notes/  assets/
    wiki/          index.md, log.md, processed.md  (only these three)
    .cache/        derived, gitignored, rebuildable
```

## Operations
ingest · query · dream · session-capture — all write back to pages + log.
