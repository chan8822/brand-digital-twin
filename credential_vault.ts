import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {CredentialEntry, SupabaseClient} from './supabase_client';

/**
 * Production-grade Secure Credential Vault for Multi-Tenant integrations.
 * Supports symmetric AES-256-GCM encryption at rest and auto OAuth token refresh.
 */
function mapPlatformToProvider(platform: string): string {
  if (platform === 'google') return 'google_ads';
  if (platform === 'meta') return 'meta_ads';
  return platform;
}

export class CredentialVault {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyBuffer: Buffer;

  constructor(
    private readonly db: SupabaseClient,
    masterKeyBase64: string, // 32-byte base64 encoded master key
  ) {
    this.keyBuffer = Buffer.from(masterKeyBase64, 'base64');
    if (this.keyBuffer.length !== 32) {
      throw new Error('Master key must be exactly 32 bytes (base64 encoded)');
    }
  }

  /**
   * Encrypts plain text using AES-256-GCM.
   */
  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, new Uint8Array(this.keyBuffer), new Uint8Array(iv));
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  }

  /**
   * Decrypts cipher text using AES-256-GCM.
   */
  decrypt(cipherText: string): string {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid cipher text format');
    }
    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, new Uint8Array(this.keyBuffer), new Uint8Array(iv));
    decipher.setAuthTag(new Uint8Array(authTag));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Encrypts and persists a secret key/value pair in Supabase DB.
   */
  async storeSecret(
    tenantId: string,
    platform: string,
    key: string,
    secretValue: string,
    refreshToken: string | null = null,
    expiresInSeconds: number | null = null,
  ): Promise<void> {
    const encrypted = this.encrypt(secretValue);
    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      : null;

    const cred: CredentialEntry = {
      tenant_id: tenantId,
      platform,
      credential_key: key,
      encrypted_value: encrypted,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    await this.db.saveCredential(cred);
  }

  /**
   * Retrieves and decrypts a secret. If expired and a refresh callback is supplied,
   * automatically triggers a refresh flow and updates the store.
   */
  async getSecret(
    tenantId: string,
    platform: string,
    key: string,
    refreshOAuthCallback?: (
      refreshToken: string,
    ) => Promise<{accessToken: string; expiresInSeconds: number}>,
  ): Promise<string> {
    const credentials = await this.db.getCredentials(tenantId);
    const cred = credentials.find(
      (c) => c.platform === platform && c.credential_key === key,
    );
    if (!cred) {
      throw new Error(
        `Credential not found: tenant=${tenantId}, platform=${platform}, key=${key}`,
      );
    }

    if (cred.expires_at && cred.refresh_token && refreshOAuthCallback) {
      const warningBufferMs = 5 * 60 * 1000; // 5 min warning threshold
      const expiryMs = new Date(cred.expires_at).getTime();
      if (expiryMs - Date.now() < warningBufferMs) {
        // Trigger token refresh
        try {
          const refreshed = await refreshOAuthCallback(cred.refresh_token);
          const newEncryptedVal = this.encrypt(refreshed.accessToken);
          const newExpiresAt = new Date(
            Date.now() + refreshed.expiresInSeconds * 1000,
          ).toISOString();

          cred.encrypted_value = newEncryptedVal;
          cred.expires_at = newExpiresAt;
          cred.updated_at = new Date().toISOString();

          await this.db.saveCredential(cred);
        } catch (refreshErr) {
          // Flag integration status as suspended in case of refresh failure
          try {
            const provider = mapPlatformToProvider(platform);
            const integration = await this.db.getIntegrationState(tenantId, provider);
            if (integration) {
              integration.status = 'suspended';
              integration.updatedAt = Date.now();
              await this.db.saveIntegrationState(integration);
            }
          } catch (dbErr) {
            // Ignore DB errors in vault to prioritize propagation of primary refresh error
          }
          throw refreshErr;
        }
      }
    }

    return this.decrypt(cred.encrypted_value);
  }
}
