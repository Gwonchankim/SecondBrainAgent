import { CredentialStore } from "./credential-store";
import { WindowsCredentialStore } from "./windows-credential-store";

/** Pick the platform backend. MVP ships Windows first; others are Phase 4. */
export function createCredentialStore(platform: NodeJS.Platform = process.platform): CredentialStore {
  switch (platform) {
    case "win32":
      return new WindowsCredentialStore();
    default:
      // macOS Keychain / libsecret backends come later — fail loud, not silent.
      throw new Error(
        `CredentialStore backend for "${platform}" not implemented yet (MVP is Windows-first).`
      );
  }
}
