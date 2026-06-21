// @mneme/desktop — Electron main process.
// Spawns the headless Core child process and bridges renderer <-> Core over stdio.
// NOTE: This is the only place that knows the transport is "local child process".
// Swapping to a remote Core (Phase 4) means swapping this bridge for a WS client.

import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";
import { StdioCoreClient, CoreEvent } from "@mneme/ipc";

let coreProc: ChildProcessWithoutNullStreams | null = null;
let client: StdioCoreClient | null = null;

function startCore(): StdioCoreClient {
  // Resolve the built core entry. (Dev: point at @mneme/core dist/bin.js.)
  const coreEntry = require.resolve("@mneme/core/dist/bin.js");
  coreProc = spawn(process.execPath, [coreEntry], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env },
  });
  return new StdioCoreClient(coreProc.stdin, coreProc.stdout);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  client?.onEvent((e: CoreEvent) => win.webContents.send("core-event", e));
}

app.whenReady().then(() => {
  client = startCore();

  // Relay a small set of CoreApi calls from the renderer.
  ipcMain.handle("core:getVaults", () => client!.call("getVaults", undefined as never));
  ipcMain.handle("core:sendMessage", (_e, input) => client!.call("sendMessage", input));
  ipcMain.handle("core:ingestSource", (_e, input) => client!.call("ingestSource", input));
  ipcMain.handle("core:approveChange", (_e, input) => client!.call("approveChange", input));
  ipcMain.handle("core:rejectChange", (_e, input) => client!.call("rejectChange", input));

  createWindow();
});

app.on("window-all-closed", () => {
  coreProc?.kill();
  if (process.platform !== "darwin") app.quit();
});
