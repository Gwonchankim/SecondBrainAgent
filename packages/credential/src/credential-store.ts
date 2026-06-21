// @mneme/credential — abstraction
//
// Provider credentials live ONLY in the Core process, backed by the OS secret
// store. They are never serialized to a client or into any vault. The Host
// fetches a secret and injects it into AgentTask at call time.

export interface CredentialStore {
  readonly backend: string;
  set(service: string, account: string, secret: string): Promise<void>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<boolean>;
}
