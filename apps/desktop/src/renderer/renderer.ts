// @mneme/desktop — renderer. Minimal chat shell wired to the preload bridge.
declare global {
  interface Window {
    mneme: {
      sendMessage(input: { vault: string; text: string }): Promise<{ runId: string }>;
      onCoreEvent(cb: (e: { type: string; [k: string]: unknown }) => void): void;
    };
  }
}

const log = document.getElementById("log")!;
const text = document.getElementById("text") as HTMLInputElement;
const send = document.getElementById("send")!;

function line(cls: string, msg: string): void {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

send.addEventListener("click", async () => {
  const value = text.value.trim();
  if (!value) return;
  line("me", value);
  text.value = "";
  const { runId } = await window.mneme.sendMessage({ vault: "personal", text: value });
  line("ev", `started ${runId}`);
});

window.mneme.onCoreEvent((e) => line("ev", `[event] ${e.type}`));

export {};
