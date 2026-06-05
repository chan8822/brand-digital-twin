import {config} from './config';
import {CredentialVault} from './credential_vault';
import {SupabaseClient} from './supabase_client';

/**
 * Returns the platform authorization URL to redirect the user to.
 */
export function generateAuthUrl(
  platform: string,
  state: string,
  shopDomain?: string
): string {
  const redirectUri = `${config.server.baseUrl}/api/v1/connect/callback/${platform}`;

  if (platform === 'google') {
    const params = new URLSearchParams({
      client_id: config.platforms.googleAds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/adwords',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  if (platform === 'meta') {
    const params = new URLSearchParams({
      client_id: config.platforms.metaAds.appId,
      redirect_uri: redirectUri,
      scope: 'ads_read,ads_management',
      state,
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  }

  if (platform === 'shopify') {
    if (!shopDomain) {
      throw new Error('Shop domain is required for Shopify connection');
    }
    const cleanShop = shopDomain.replace(/^https?:\/\//, '').trim();
    const params = new URLSearchParams({
      client_id: config.platforms.shopify.clientId,
      redirect_uri: redirectUri,
      scope: 'read_orders,read_products,write_orders',
      state,
    });
    return `https://${cleanShop}/admin/oauth/authorize?${params.toString()}`;
  }

  throw new Error(`Unsupported OAuth platform: ${platform}`);
}

/**
 * Exchanges the code for real credentials. Returns mock credentials in test environment.
 */
export async function exchangeCode(
  platform: string,
  code: string,
  redirectUri: string,
  mockMode = true,
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
}> {
  if (mockMode) {
    return {
      accessToken: `mock-access-token-${platform}-${code}`,
      refreshToken: `mock-refresh-token-${platform}`,
      expiresInSeconds: 3600, // 1 hour
    };
  }

  throw new Error('Real network calls not supported in mock environment');
}

/**
 * Encapsulates the code exchange and secure persistence inside the CredentialVault.
 */
export async function handleOauthCallback(
  db: SupabaseClient,
  platform: string,
  code: string,
  tenantId: string,
  mockMode = true,
): Promise<void> {
  const redirectUri = `${config.server.baseUrl}/api/v1/connect/callback/${platform}`;
  const exchanged = await exchangeCode(platform, code, redirectUri, mockMode);

  // Initialize vault
  const vault = new CredentialVault(db, config.auth.masterKey);

  // Securely persist in CredentialVault
  await vault.storeSecret(
    tenantId,
    platform,
    'oauth_token',
    exchanged.accessToken,
    exchanged.refreshToken,
    exchanged.expiresInSeconds,
  );
}
