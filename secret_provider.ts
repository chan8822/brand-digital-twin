/**
 * Interface representing a provider for resolving secrets asynchronously.
 */
export interface SecretProvider {
  /**
   * Resolves a secret by its key.
   * @param key The key or name of the secret to resolve.
   * @returns A promise that resolves to the secret value, or an empty string if not found.
   */
  getSecret(key: string): Promise<string>;
}

