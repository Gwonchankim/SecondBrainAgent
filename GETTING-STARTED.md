# GETTING-STARTED — bootstrap on Windows & drive with the Claude CLI

Project folder: `C:\Users\amole\Desktop\SecondBrainAgent`

## Prerequisites
- **Node.js 20 LTS** (`node -v` → v20.x). Includes npm 10 (workspaces).
- **Git** (`git --version`).
- **Claude CLI** installed and logged in (`claude --version`, then `claude` to log
  in with your subscription). Optionally **Codex CLI** for the OpenAI side.

## 1. Put the scaffold into the project folder
Extract the contents of `mneme-phase0-scaffold.zip` so the monorepo root **is**
the project folder (i.e. `SecondBrainAgent\package.json` exists). In PowerShell:

```powershell
cd "C:\Users\amole\Desktop"
# Extract (the zip contains a top-level 'mneme' folder)
Expand-Archive -Path ".\mneme-phase0-scaffold.zip" -DestinationPath ".\_mneme_tmp" -Force
# Move its contents into SecondBrainAgent
New-Item -ItemType Directory -Force -Path ".\SecondBrainAgent" | Out-Null
Copy-Item -Path ".\_mneme_tmp\mneme\*" -Destination ".\SecondBrainAgent" -Recurse -Force
Remove-Item -Recurse -Force ".\_mneme_tmp"
cd ".\SecondBrainAgent"
```

## 2. Install
```powershell
npm install
```
This links the internal `@mneme/*` packages (npm workspaces) and pulls external
deps. It also downloads the **Electron** binary (large) for `apps/desktop`. If you
want to skip Electron for now, you can instead run:
```powershell
npm install --workspace packages/provider --workspace packages/ipc --workspace packages/wiki --workspace packages/credential --workspace packages/cache --workspace packages/core --include-workspace-root
```

## 3. Verify it works
```powershell
npm run typecheck     # expect: 0 errors
npm run dev:capture   # worktree capture: shows create/delete/modify + "working tree clean: YES"
npm run dev:init      # ingest -> proposal -> ApprovalRequired -> approve -> merge -> rebuild
npm run dev:auth      # real auth probe (will say "claude/codex not found" until step 4)
```

## 4. Initialize Git + log in the backend
```powershell
git init
git add -A
git commit -m "chore: import Mneme Phase 0 scaffold"

claude            # log in with your Claude subscription (delegated OAuth)
# inside claude, run: /status   -> confirm the auth method, then exit
```
Now `npm run dev:auth` should report `claude-code delegated -> authenticated:true`.

## 5. Drive development with the Claude CLI (this is your new workflow)
From inside `SecondBrainAgent`, just start Claude Code:
```powershell
claude
```
It auto-loads `CLAUDE.md` (your working brief) and `PRD.md` is one read away. Then
give it tasks. Good first prompts, in order (each maps to PRD §8 Phase 1):

1. *"Read CLAUDE.md and PRD.md. Implement the ingest instruction builder in
   `packages/core`: a Host function that, given a raw source, produces the prompt
   for `claude -p` to write a `raw/pages/<slug>.md` page conforming to the
   frontmatter schema. Wire it into `MnemeCore.makeProposal` and keep the adapter
   thin. Run `npm run typecheck` and `npm run dev:init` and fix anything that breaks."*

2. *"Replace the `memory-map` stub derivation with a real one: parse all
   `raw/pages/*.md` frontmatter + wikilinks into a compact per-vault map written to
   `.cache/memory-map.json`. Keep it rebuildable. Add a small dev script to print it."*

3. *"Wire the Electron shell to the Core: have `apps/desktop` send sendMessage and
   ingestSource over the existing stdio bridge and render the event stream. Don't
   change `CoreApi`."*

### Tips for the CLI workflow
- Work in small, verifiable steps; after each, ask it to run `npm run typecheck`.
- Use Claude Code's plan mode for anything touching invariants (§1 of PRD).
- Keep commits small; the proposal-branch philosophy applies to your own Git too.
- For real `runTask` end-to-end: once logged in, `MnemeCore` ingest will invoke
  `claude -p` on a vault. Watch cost with `claude`'s `/cost` and the budget caps.

## Notes / gotchas
- **Encoding:** keep source files UTF-8 + LF and source comments in English
  (`.editorconfig`/`.gitattributes` enforce this).
- **Credentials:** the `@napi-rs/keyring` native module backs the Windows
  Credential Manager store; it ships prebuilt, so `npm install` needs no compiler.
- **Subscription vs API key:** running your own logged-in `claude` from this repo
  is the delegated path (compliant). Switch to `ANTHROPIC_API_KEY` only if you move
  to unattended/multi-user automation. See PRD §1 "Auth model".
- **Vaults are separate Git repos**, created under a runtime workspace (default
  `~/.mneme-workspace/vaults/...` or `MNEME_WORKSPACE`), not inside this source repo.
