// @mneme/ipc — stdio client
// Used by the Electron main process to talk to the Core child process.

import { EventEmitter } from "node:events";
import * as readline from "node:readline";
import { Readable, Writable } from "node:stream";
import { CoreApi, CoreEvent, RpcMessage } from "./protocol";

export class StdioCoreClient {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private emitter = new EventEmitter();

  constructor(private toCore: Writable, fromCore: Readable) {
    const rl = readline.createInterface({ input: fromCore });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: RpcMessage;
      try {
        msg = JSON.parse(line) as RpcMessage;
      } catch {
        return;
      }
      if ("event" in msg) {
        this.emitter.emit("event", msg.event);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    });
  }

  onEvent(listener: (e: CoreEvent) => void): void {
    this.emitter.on("event", listener);
  }

  call<M extends keyof CoreApi>(
    method: M,
    params: Parameters<CoreApi[M]>[0]
  ): ReturnType<CoreApi[M]> {
    const id = ++this.seq;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.toCore.write(JSON.stringify({ id, method, params }) + "\n");
    return promise as ReturnType<CoreApi[M]>;
  }
}
