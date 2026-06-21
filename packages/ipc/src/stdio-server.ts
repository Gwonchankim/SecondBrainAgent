// @mneme/ipc — stdio server
// Serves a CoreApi implementation over line-delimited JSON-RPC on stdin/stdout.

import * as readline from "node:readline";
import { CoreApi, CoreEvent, RpcRequest, RpcResponse } from "./protocol";

export interface CoreEventSource {
  onEvent(listener: (e: CoreEvent) => void): void;
}

export function serveStdio(api: CoreApi, events: CoreEventSource): void {
  const write = (msg: object) => process.stdout.write(JSON.stringify(msg) + "\n");

  events.onEvent((event) => write({ event }));

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let req: RpcRequest;
    try {
      req = JSON.parse(line) as RpcRequest;
    } catch {
      return;
    }
    const res: RpcResponse = { id: req.id };
    try {
      const fn = api[req.method] as (p: unknown) => Promise<unknown>;
      if (typeof fn !== "function") throw new Error(`Unknown method: ${String(req.method)}`);
      res.result = await fn.call(api, req.params);
    } catch (err) {
      res.error = { message: err instanceof Error ? err.message : String(err) };
    }
    write(res);
  });
}
