import {SecretProvider} from './secret_provider';

/**
 * Interface representing a client for a backing key management service or vault.
 */
export interface VaultClient {
  /**
   * Fetches a secret by its name from the vault.
   * @param secretName Name of the secret.
   * @returns The secret value.
   */
  fetchSecret(secretName: string): Promise<string>;
}

/**
 * SecretProvider implementation that retrieves secrets from a vault client and caches them with TTL.
 */
export class ManagedSecretProvider implements SecretProvider {
  private readonly cache = new Map<string, { value: string; expiresAt: number }>();
  private readonly inFlightFetch = new Map<string, Promise<string>>();

  constructor(
    private readonly vaultClient: VaultClient,
    private readonly ttlMs: number = 5 * 60 * 1000, // 5 minutes TTL
    private readonly maxCacheSize: number = 1000,
  ) {}

  /**
   * Resolves a secret by its key. Checks TTL cache first.
   * @param key Key or name of the secret.
   * @returns The resolved secret value.
   */
  async getSecret(key: string): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      // LRU refresh: move key to the end of Map insertion order
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.value;
    }

    const inFlight = this.inFlightFetch.get(key);
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      try {
        const value = await this.vaultClient.fetchSecret(key);
        this.cache.set(key, {
          value,
          expiresAt: Date.now() + this.ttlMs,
        });
        this.pruneCacheIfNecessary();
        return value;
      } catch (err: any) {
        const fallback = this.cache.get(key);
        if (fallback) {
          console.warn(`[ManagedSecretProvider] Failed to fetch secret "${key}" from vault: ${err?.message || err}. Serving stale cached value.`);
          return fallback.value;
        }
        throw err;
      } finally {
        this.inFlightFetch.delete(key);
      }
    })();

    this.inFlightFetch.set(key, promise);
    return promise;
  }

  /**
   * Force-evict a key from the cache.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    this.inFlightFetch.delete(key);
  }

  /**
   * Clear the entire cache and cancel track of in-flight fetches.
   */
  clear(): void {
    this.cache.clear();
    this.inFlightFetch.clear();
  }

  private pruneCacheIfNecessary(): void {
    while (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }
}
