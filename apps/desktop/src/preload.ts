// @mneme/desktop — preload. Exposes a minimal, safe bridge to the renderer.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mneme", {
  getVaults: () => ipcRenderer.invoke("core:getVaults"),
  sendMessage: (input: { vault: string; text: string }) => ipcRenderer.invoke("core:sendMessage", input),
  ingestSource: (input: { vault: string; kind: "url" | "text" | "file"; value: string }) =>
    ipcRenderer.invoke("core:ingestSource", input),
  approveChange: (input: { proposalId: string }) => ipcRenderer.invoke("core:approveChange", input),
  rejectChange: (input: { proposalId: string }) => ipcRenderer.invoke("core:rejectChange", input),
  onCoreEvent: (cb: (e: unknown) => void) => ipcRenderer.on("core-event", (_e, payload) => cb(payload)),
});
