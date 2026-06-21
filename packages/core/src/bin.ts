#!/usr/bin/env node
// @mneme/core — process entry point.
// Constructs the Core with the Windows credential store + Claude Code adapter,
// then serves CoreApi over stdio. The Electron client spawns this process.

import * as path from "node:path";
import * as os from "node:os";
import { serveStdio } from "@mneme/ipc";
import { createCredentialStore } from "@mneme/credential";
import { CacheManager, memoryMapDerivation, graphIndexDerivation, searchIndexDerivation } from "@mneme/cache";
import { ClaudeCodeAdapter } from "./adapters/claude-code-adapter";
import { CodexAdapter } from "./adapters/codex-adapter";
import { MnemeCore } from "./core";
import { DEFAULT_PERSONAL_POLICY, DEFAULT_WORK_POLICY } from "./policies";

async function main(): Promise<void> {
  const cache = new CacheManager()
    .register(memoryMapDerivation)
    .register(graphIndexDerivation)
    .register(searchIndexDerivation);

  const credentials = (() => {
    try {
      return createCredentialStore();
    } catch (e) {
      // On non-Windows dev machines, fall back to a clearly-marked no-op so the
      // process still boots for development. Production is Windows-first.
      process.stderr.write(`[core] credential store: ${(e as Error).message}\n`);
      return {
        backend: "noop",
        async set() {},
        async get() { return null; },
        async delete() { return false; },
      };
    }
  })();

  const providers = new Map<string, import("@mneme/provider").AgentProvider>([
    ["claude-code", new ClaudeCodeAdapter()],
    ["codex", new CodexAdapter()],
  ]);
  const core = new MnemeCore({ credentials, cache, providers, defaultProviderId: "claude-code" });

  // MVP: a single workspace under the user home; vaults are git repos within it.
  const wsRoot = process.env.MNEME_WORKSPACE ?? path.join(os.homedir(), ".mneme-workspace", "vaults");
  await core.registerVault("personal", path.join(wsRoot, "personal"), DEFAULT_PERSONAL_POLICY);
  await core.registerVault("work", path.join(wsRoot, "work"), DEFAULT_WORK_POLICY);

  serveStdio(core, core);
  process.stderr.write("[core] serving CoreApi over stdio\n");
}

main().catch((e) => {
  process.stderr.write(`[core] fatal: ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
