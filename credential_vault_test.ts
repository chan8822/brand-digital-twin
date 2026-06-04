import 'jasmine';
import {randomBytes} from 'node:crypto';
import {CredentialVault} from './credential_vault';
import {SupabaseClient} from './supabase_client';

describe('CredentialVault Secure Storage & Rotation', () => {
  let db: SupabaseClient;
  let vault: CredentialVault;
  const masterKey = randomBytes(32).toString('base64');
  const tenantId = 'tenant_vault_tests';

  beforeEach(() => {
    db = new SupabaseClient();
    vault = new CredentialVault(db, masterKey);
  });

  it('fails initialization with invalid master key size', () => {
    const invalidKey = randomBytes(16).toString('base64');
    expect(() => new CredentialVault(db, invalidKey)).toThrowError(
      /Master key must be exactly 32 bytes/,
    );
  });

  it('stores and decrypts a simple API secret token', async () => {
    await vault.storeSecret(tenantId, 'shopify', 'access_token', 'shp_live_abc123');

    const decrypted = await vault.getSecret(tenantId, 'shopify', 'access_token');
    expect(decrypted).toBe('shp_live_abc123');

    // Verify it is actually encrypted in DB
    const rawCreds = await db.getCredentials(tenantId);
    const raw = rawCreds.find((c) => c.platform === 'shopify' && c.credential_key === 'access_token');
    expect(raw).toBeDefined();
    expect(raw?.encrypted_value).not.toBe('shp_live_abc123');
    expect(raw?.encrypted_value).toContain(':'); // IV:Cipher:Tag format
  });

  it('throws an error if credential does not exist', async () => {
    await expectAsync(
      vault.getSecret(tenantId, 'shopify', 'non_existent'),
    ).toBeRejectedWithError(/Credential not found/);
  });

  it('automatically triggers OAuth refresh callback and rotates credentials if token is close to expiry', async () => {
    // Save a token with a very short expiration (already expired by using negative seconds, or 1 second)
    // We set expiresInSeconds = 2 seconds, which immediately places it within the 5 min buffer threshold
    await vault.storeSecret(
      tenantId,
      'google',
      'oauth_token',
      'old_access_token_123',
      'refresh_token_xyz999',
      2, // 2 seconds to live -> automatically triggers refresh
    );

    let callbackTriggered = false;
    const refreshCallback = async (refreshToken: string) => {
      expect(refreshToken).toBe('refresh_token_xyz999');
      callbackTriggered = true;
      return {
        accessToken: 'new_rotated_access_token_456',
        expiresInSeconds: 3600,
      };
    };

    const token = await vault.getSecret(
      tenantId,
      'google',
      'oauth_token',
      refreshCallback,
    );

    expect(callbackTriggered).toBe(true);
    expect(token).toBe('new_rotated_access_token_456');

    // Fetch again without callback to verify new value is persistent in DB
    const persistentToken = await vault.getSecret(tenantId, 'google', 'oauth_token');
    expect(persistentToken).toBe('new_rotated_access_token_456');
  });

  it('does not trigger OAuth refresh callback if token has plenty of time left to live', async () => {
    await vault.storeSecret(
      tenantId,
      'google',
      'oauth_token',
      'fresh_access_token_000',
      'refresh_token_xyz999',
      3600, // 1 hour -> well outside the 5 min warning threshold
    );

    let callbackTriggered = false;
    const refreshCallback = async (refreshToken: string) => {
      callbackTriggered = true;
      return {
        accessToken: 'should_not_rotate_yet',
        expiresInSeconds: 3600,
      };
    };

    const token = await vault.getSecret(
      tenantId,
      'google',
      'oauth_token',
      refreshCallback,
    );

    expect(callbackTriggered).toBe(false);
    expect(token).toBe('fresh_access_token_000');
  });
});
