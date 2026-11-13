import { Entry } from '@napi-rs/keyring';

/**
 * Where credentials live (SECURITY C-08). The database only ever holds the
 * `ref` that names an entry here, never the secret.
 */
export interface SecretStore {
  /** The secret, or null when there is none under `ref`. */
  get(ref: string): string | null;
  set(ref: string, secret: string): void;
  /** Removes the secret. Not an error if it does not exist. */
  delete(ref: string): void;
}

export class SecretStoreError extends Error {
  constructor(operation: string, cause: unknown) {
    // The cause may come from the OS; it never contains the secret itself.
    super(`Cofre de credenciais indisponível (${operation}).`, { cause });
    this.name = 'SecretStoreError';
  }
}

const SERVICE = 'enterprise-agents';

/** The operating system's credential vault (Credential Manager on Windows). */
export class KeyringSecretStore implements SecretStore {
  constructor(private readonly service = SERVICE) {}

  private run<T>(operation: string, action: (entry: Entry) => T, ref: string): T {
    try {
      return action(new Entry(this.service, ref));
    } catch (error) {
      throw new SecretStoreError(operation, error);
    }
  }

  get(ref: string): string | null {
    return this.run('leitura', (entry) => entry.getPassword() ?? null, ref);
  }

  set(ref: string, secret: string): void {
    this.run('gravação', (entry) => entry.setPassword(secret), ref);
  }

  delete(ref: string): void {
    // Deleting a missing entry is reported differently per platform; check first.
    this.run(
      'remoção',
      (entry) => {
        if (entry.getPassword() != null) entry.deletePassword();
      },
      ref,
    );
  }
}

/**
 * Keeps secrets in process memory only: they are gone when the server stops.
 * For automated tests, so they never touch the user's real vault.
 */
export class MemorySecretStore implements SecretStore {
  private readonly secrets = new Map<string, string>();

  get(ref: string): string | null {
    return this.secrets.get(ref) ?? null;
  }

  set(ref: string, secret: string): void {
    this.secrets.set(ref, secret);
  }

  delete(ref: string): void {
    this.secrets.delete(ref);
  }
}
