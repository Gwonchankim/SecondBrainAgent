// @mneme/core — shared CLI probe
// Runs a backend CLI non-interactively and reports whether it ran + its exit code.
// Distinguishes "binary not on PATH" (ENOENT) from "ran but exited non-zero".

import { execFile } from "node:child_process";

export interface CliProbe {
  /** false = binary not found on PATH (ENOENT). */
  ran: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export function probeCli(bin: string, args: string[], timeoutMs = 8000): Promise<CliProbe> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
      if (e && e.code === "ENOENT") {
        resolve({ ran: false, code: null, stdout: "", stderr: "", error: "ENOENT" });
        return;
      }
      const code = e && typeof e.code === "number" ? e.code : e ? 1 : 0;
      resolve({ ran: true, code, stdout: stdout ?? "", stderr: stderr ?? "", error: e ? e.message : undefined });
    });
  });
}
