import {SecretProvider} from './secret_provider';

/**
 * SecretProvider implementation that retrieves secrets from environment variables.
 */
export class EnvSecretProvider implements SecretProvider {
  /**
   * Retrieves a secret value from process.env.
   * @param key The environment variable key.
   * @returns The secret value or an empty string.
   */
  async getSecret(key: string): Promise<string> {
    return (process.env[key] || '').trim();
  }
}

