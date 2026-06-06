import 'jasmine';
import {randomBytes} from 'node:crypto';
import {CredentialVault} from './credential_vault';
import {SupabaseClient, CredentialEntry} from './supabase_client';

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

  it('should mark integration status as suspended if OAuth refresh callback throws an error', async () => {
    // 1. Setup integration state as active
    await db.saveIntegrationState({
      integrationId: 'int-123',
      tenantId,
      provider: 'google_ads',
      status: 'active',
      settings: {},
      updatedAt: Date.now(),
    });

    // 2. Setup credential that is close to expiry
    await vault.storeSecret(
      tenantId,
      'google', // maps to google_ads
      'oauth_token',
      'old_access_token_123',
      'refresh_token_xyz999',
      2, // triggers refresh
    );

    // 3. Trigger secret fetch with a failing refresh callback
    const failingCallback = async (refreshToken: string) => {
      throw new Error('OAuth server returned 400 Bad Request (invalid grant)');
    };

    await expectAsync(
      vault.getSecret(tenantId, 'google', 'oauth_token', failingCallback)
    ).toBeRejectedWithError(/invalid grant/);

    // 4. Verify integration state has transitioned to suspended
    const state = await db.getIntegrationState(tenantId, 'google_ads');
    expect(state).toBeDefined();
    expect(state?.status).toBe('suspended');
  });

  it('sanitizes decryption exceptions and does not leak crypto details (Test Case 3.3)', () => {
    // 1. Attempt decryption with corrupted ciphertext format
    expect(() => vault.decrypt('invalid_ciphertext')).toThrowError('Decryption failed');

    // 2. Attempt decryption with valid format but wrong auth tag/key (decipher.final failure)
    const badCiphertext = '00112233445566778899aabb:ccddeeff:00112233445566778899aabbccddeeff';
    expect(() => vault.decrypt(badCiphertext)).toThrowError('Decryption failed');

    // 3. Verify error message is precisely 'Decryption failed' and doesn't contain stack traces or raw crypto errors
    try {
      vault.decrypt(badCiphertext);
      fail('Should have thrown an error');
    } catch (err: any) {
      expect(err.message).toBe('Decryption failed');
      expect(err.stack).not.toContain('Unsupported state');
      expect(err.stack).not.toContain('unable to authenticate data');
    }
  });

  it('coalesces concurrent oauth refreshes to avoid thundering herd and duplicate writes', async () => {
    await vault.storeSecret(
      tenantId,
      'google',
      'oauth_token',
      'old_access_token_123',
      'refresh_token_xyz999',
      2, // close to expiry
    );

    let refreshCallCount = 0;
    let resolveRefresh: (val: {accessToken: string; expiresInSeconds: number}) => void;
    const deferred = new Promise<{accessToken: string; expiresInSeconds: number}>((resolve) => {
      resolveRefresh = resolve;
    });

    const refreshCallback = async (refreshToken: string) => {
      refreshCallCount++;
      return deferred;
    };

    // Trigger three concurrent getSecret calls
    const p1 = vault.getSecret(tenantId, 'google', 'oauth_token', refreshCallback);
    const p2 = vault.getSecret(tenantId, 'google', 'oauth_token', refreshCallback);
    const p3 = vault.getSecret(tenantId, 'google', 'oauth_token', refreshCallback);

    resolveRefresh!({
      accessToken: 'coalesced_token_value',
      expiresInSeconds: 3600,
    });

    const tokens = await Promise.all([p1, p2, p3]);
    expect(tokens[0]).toBe('coalesced_token_value');
    expect(tokens[1]).toBe('coalesced_token_value');
    expect(tokens[2]).toBe('coalesced_token_value');

    expect(refreshCallCount).toBe(1); // Only 1 OAuth refresh request made!
  });

  it('coalesces refreshes even when database reads are staggered and resolve stale credentials after refresh completes', async () => {
    await vault.storeSecret(
      tenantId,
      'google',
      'oauth_token',
      'old_access_token_123',
      'refresh_token_xyz999',
      2, // close to expiry
    );

    let refreshCallCount = 0;
    const refreshCallback = async (refreshToken: string) => {
      refreshCallCount++;
      return {
        accessToken: `new_token_value_${refreshCallCount}`,
        expiresInSeconds: 3600,
      };
    };

    const originalGetCredentials = db.getCredentials.bind(db);
    const oldCreds = JSON.parse(JSON.stringify(await originalGetCredentials(tenantId))) as CredentialEntry[];
    let callIndex = 0;

    spyOn(db, 'getCredentials').and.callFake(async (tId: string): Promise<CredentialEntry[]> => {
      callIndex++;
      if (callIndex === 2) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
        return JSON.parse(JSON.stringify(oldCreds)) as CredentialEntry[];
      }
      return originalGetCredentials(tId);
    });

    const p1 = vault.getSecret(tenantId, 'google', 'oauth_token', refreshCallback);
    // Initiate second getSecret call after 5ms (while p1 is refreshing or completing)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    const p2 = vault.getSecret(tenantId, 'google', 'oauth_token', refreshCallback);

    const [token1, token2] = await Promise.all([p1, p2]);
    expect(token1).toBe('new_token_value_1');
    expect(token2).toBe('new_token_value_1');
    expect(refreshCallCount).toBe(1);
  });

  it('recovers gracefully from database save failures during token refresh and serves subsequent calls from memory', async () => {
    await vault.storeSecret(
      tenantId,
      'google',
      'oauth_token',
      'old_access_token_123',
      'refresh_token_xyz999',
      2, // close to expiry
    );

    let refreshCallCount = 0;
    const refreshCallback = async (refreshToken: string) => {
      refreshCallCount++;
      return {
        accessToken: `new_token_value_${refreshCallCount}`,
        expiresInSeconds: 3600,
      };
    };

    // Force db.saveCredential to throw an error
    spyOn(db, 'saveCredential').and.callFake(async () => {
      throw new Error('Database connection timeout');
    });

    // Verify first getSecret succeeds and returns the new token, despite the DB save failure
    const token1 = await vault.getSecret(tenantId, 'google', 'oauth_token', refreshCallback);
    expect(token1).toBe('new_token_value_1');
    expect(refreshCallCount).toBe(1);

    // Verify subsequent getSecret call returns the cached token from memory without triggering another refresh
    const token2 = await vault.getSecret(tenantId, 'google', 'oauth_token', refreshCallback);
    expect(token2).toBe('new_token_value_1');
    expect(refreshCallCount).toBe(1);
  });
});
