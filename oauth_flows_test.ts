import 'jasmine';
import {generateAuthUrl, exchangeCode, handleOauthCallback} from './oauth_flows';
import {SupabaseClient} from './supabase_client';
import {config} from './config';
import {CredentialVault} from './credential_vault';

describe('OAuth Flow Helpers', () => {
  let db: SupabaseClient;

  beforeEach(() => {
    db = new SupabaseClient('http://mock-url', 'mock-key', true); // mockMode = true
    SupabaseClient.resetGlobalMockDb();
    SupabaseClient.useSharedMockDb = true;
  });

  describe('generateAuthUrl', () => {
    it('should generate correct Google Ads OAuth URL', () => {
      const state = 'signed-state-token-123';
      const url = generateAuthUrl('google', state);
      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain(`client_id=${config.platforms.googleAds.clientId}`);
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords');
    });

    it('should generate correct Meta OAuth URL', () => {
      const state = 'signed-state-token-123';
      const url = generateAuthUrl('meta', state);
      expect(url).toContain('www.facebook.com/v19.0/dialog/oauth');
      expect(url).toContain(`client_id=${config.platforms.metaAds.appId}`);
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('scope=ads_read%2Cads_management');
    });

    it('should generate correct Shopify OAuth URL', () => {
      const state = 'signed-state-token-123';
      const url = generateAuthUrl('shopify', state, 'my-test-store.myshopify.com');
      expect(url).toContain('my-test-store.myshopify.com/admin/oauth/authorize');
      expect(url).toContain(`client_id=${config.platforms.shopify.clientId}`);
      expect(url).toContain(`state=${state}`);
    });

    it('should throw error if Shopify store is missing', () => {
      expect(() => generateAuthUrl('shopify', 'state')).toThrowError(/Shop domain is required/);
    });
  });

  describe('exchangeCode', () => {
    it('should return mock tokens in mock mode', async () => {
      const res = await exchangeCode('google', 'auth-code-xyz', 'http://redirect');
      expect(res.accessToken).toBe('mock-access-token-google-auth-code-xyz');
      expect(res.refreshToken).toBe('mock-refresh-token-google');
      expect(res.expiresInSeconds).toBe(3600);
    });
  });

  describe('handleOauthCallback', () => {
    it('should exchange code and persist encrypted credentials in vault', async () => {
      const tenantId = 'tenant-xyz';
      await handleOauthCallback(db, 'google', 'code-123', tenantId, true);

      // Initialize vault with same config master key to verify decryption
      const vault = new CredentialVault(db, config.auth.masterKey);
      const secret = await vault.getSecret(tenantId, 'google', 'oauth_token');
      expect(secret).toBe('mock-access-token-google-code-123');

      // Verify refresh token is saved raw (not encrypted by vault directly in refresh_token field)
      const creds = await db.getCredentials(tenantId);
      expect(creds.length).toBe(1);
      expect(creds[0].refresh_token).toBe('mock-refresh-token-google');
    });
  });
});
