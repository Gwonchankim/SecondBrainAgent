// scripts/dev-auth.ts
// Demonstrates the REAL authenticate() path (no stub): each adapter shells out
// to its CLI and reports actual auth state. On a machine without the CLIs
// installed you get a truthful "not found -> loginHint" result.
// Run: npx ts-node scripts/dev-auth.ts

import { ClaudeCodeAdapter, CodexAdapter } from "@mneme/core";
import { AgentProvider } from "@mneme/provider";

async function report(p: AgentProvider): Promise<void> {
  const caps = p.getCapabilities();
  console.log(`\n# ${p.id}  authModes=[${caps.authModes.join(", ")}]`);
  for (const mode of caps.authModes) {
    const status = await p.authenticate({ mode });
    console.log(`  ${mode.padEnd(10)} ->`, JSON.stringify(status));
  }
}

async function main(): Promise<void> {
  await report(new ClaudeCodeAdapter());
  await report(new CodexAdapter());
}

main().catch((e) => { console.error(e); process.exit(1); });
