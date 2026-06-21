// @mneme/credential — Windows Credential Manager backend (MVP default).
//
// Uses @napi-rs/keyring (prebuilt, cross-platform). We require() it lazily and
// wrap it behind a local interface so typecheck never depends on its types.

import { CredentialStore } from "./credential-store";

interface KeyringEntryLike {
  getPassword(): string | null;
  setPassword(secret: string): void;
  deletePassword(): boolean;
}
interface KeyringModule {
  Entry: new (service: string, account: string) => KeyringEntryLike;
}

function loadKeyring(): KeyringModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("@napi-rs/keyring") as KeyringModule;
}

export class WindowsCredentialStore implements CredentialStore {
  readonly backend = "windows-credential-manager";
  private mod = loadKeyring();

  private entry(service: string, account: string): KeyringEntryLike {
    return new this.mod.Entry(service, account);
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    this.entry(service, account).setPassword(secret);
  }
  async get(service: string, account: string): Promise<string | null> {
    try {
      return this.entry(service, account).getPassword();
    } catch {
      return null;
    }
  }
  async delete(service: string, account: string): Promise<boolean> {
    try {
      return this.entry(service, account).deletePassword();
    } catch {
      return false;
    }
  }
}
