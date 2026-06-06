import {SecretProvider} from './secret_provider';

let isInitialized =
  process.env['NODE_ENV'] === 'test' ||
  typeof (globalThis as Record<string, unknown>)['jasmine'] !== 'undefined';

const rawConfig = {
  server: {
    port: Number(process.env['PORT'] || '3000'),
    env: process.env['NODE_ENV'] || 'development',
    baseUrl: process.env['BASE_URL'] || 'http://localhost:3000',
  },
  auth: {
    jwtSecret: process.env['JWT_SECRET'] || 'default-super-secret-key-9988',
    masterKey:
      process.env['MASTER_KEY'] || Buffer.alloc(32, 'a').toString('base64'),
    inviteAllowlistEnabled: process.env['INVITE_ALLOWLIST_ENABLED'] !== 'false',
  },
  database: {
    url:
      process.env['SUPABASE_URL'] || 'https://mock-supabase.brandtwin.internal',
    key: process.env['SUPABASE_KEY'] || 'mock-secret-key-12345',
  },
  legal: {
    activeVersion: process.env['LEGAL_ACTIVE_VERSION'] || '',
  },
  governance: {
    defaultDailyRiskCap: Number(
      process.env['GOVERNANCE_DEFAULT_DAILY_RISK_CAP'] || '300',
    ),
    defaultConfidenceThreshold: Number(
      process.env['GOVERNANCE_DEFAULT_CONFIDENCE_THRESHOLD'] || '85',
    ),
  },
  platforms: {
    googleAds: {
      developerToken:
        process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] || 'mock-dev-token',
      clientId: process.env['GOOGLE_ADS_CLIENT_ID'] || 'mock-client-id',
      clientSecret:
        process.env['GOOGLE_ADS_CLIENT_SECRET'] || 'mock-client-secret',
      rateLimitMax: Number(process.env['GOOGLE_ADS_RATE_LIMIT_MAX'] || '10'),
      rateLimitRefillRate: Number(
        process.env['GOOGLE_ADS_RATE_LIMIT_REFILL_RATE'] || '2',
      ),
    },
    metaAds: {
      appId: process.env['META_ADS_APP_ID'] || 'mock-meta-app-id',
      appSecret: process.env['META_ADS_APP_SECRET'] || 'mock-meta-app-secret',
    },
    shopify: {
      clientId: process.env['SHOPIFY_CLIENT_ID'] || 'mock-shopify-client-id',
      clientSecret:
        process.env['SHOPIFY_CLIENT_SECRET'] || 'mock-shopify-client-secret',
    },
  },
  rateLimit: {
    maxRequests: Number(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
    refillRatePerSec: Number(
      process.env['RATE_LIMIT_REFILL_RATE_PER_SEC'] || '1.666',
    ),
  },
};

function assertInitialized() {
  if (!isInitialized) {
    throw new Error('STARTUP ERROR: Config accessed before initialization.');
  }
}

/**
 * Global configuration object for the Brand Digital Twin application.
 * Access to sensitive fields is protected by getters that assert initialization.
 */
export const config = {
  get server() {
    return rawConfig.server;
  },
  get auth() {
    assertInitialized();
    return rawConfig.auth;
  },
  get database() {
    assertInitialized();
    return rawConfig.database;
  },
  get legal() {
    assertInitialized();
    return rawConfig.legal;
  },
  get governance() {
    assertInitialized();
    return rawConfig.governance;
  },
  get platforms() {
    assertInitialized();
    return rawConfig.platforms;
  },
  get rateLimit() {
    assertInitialized();
    return rawConfig.rateLimit;
  },
};

/**
 * Asynchronously initializes configuration by fetching secrets from the provided SecretProvider.
 * @param provider The SecretProvider to resolve credentials.
 */
export async function initializeConfig(
  provider: SecretProvider
): Promise<void> {
  rawConfig.auth.jwtSecret =
    (await provider.getSecret('JWT_SECRET')) || process.env['JWT_SECRET'] || 'default-super-secret-key-9988';
  rawConfig.auth.masterKey =
    (await provider.getSecret('MASTER_KEY')) || process.env['MASTER_KEY'] || Buffer.alloc(32, 'a').toString('base64');
  rawConfig.database.url =
    (await provider.getSecret('SUPABASE_URL')) || process.env['SUPABASE_URL'] || 'https://mock-supabase.brandtwin.internal';
  rawConfig.database.key =
    (await provider.getSecret('SUPABASE_KEY')) || process.env['SUPABASE_KEY'] || 'mock-secret-key-12345';

  rawConfig.platforms.googleAds.developerToken =
    (await provider.getSecret('GOOGLE_ADS_DEVELOPER_TOKEN')) ||
    process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] || 'mock-dev-token';
  rawConfig.platforms.googleAds.clientId =
    (await provider.getSecret('GOOGLE_ADS_CLIENT_ID')) ||
    process.env['GOOGLE_ADS_CLIENT_ID'] || 'mock-client-id';
  rawConfig.platforms.googleAds.clientSecret =
    (await provider.getSecret('GOOGLE_ADS_CLIENT_SECRET')) ||
    process.env['GOOGLE_ADS_CLIENT_SECRET'] || 'mock-client-secret';

  rawConfig.platforms.metaAds.appId =
    (await provider.getSecret('META_ADS_APP_ID')) ||
    process.env['META_ADS_APP_ID'] || 'mock-meta-app-id';
  rawConfig.platforms.metaAds.appSecret =
    (await provider.getSecret('META_ADS_APP_SECRET')) ||
    process.env['META_ADS_APP_SECRET'] || 'mock-meta-app-secret';

  rawConfig.platforms.shopify.clientId =
    (await provider.getSecret('SHOPIFY_CLIENT_ID')) ||
    process.env['SHOPIFY_CLIENT_ID'] || 'mock-shopify-client-id';
  rawConfig.platforms.shopify.clientSecret =
    (await provider.getSecret('SHOPIFY_CLIENT_SECRET')) ||
    process.env['SHOPIFY_CLIENT_SECRET'] || 'mock-shopify-client-secret';

  isInitialized = true;
  validateEnv();
}

/**
 * Validates that all required configuration variables are present and are not mock values
 * in non-test environments.
 */
export function validateEnv() {
  const isTest =
    process.env['NODE_ENV'] === 'test' ||
    typeof (globalThis as Record<string, unknown>)['jasmine'] !== 'undefined';
  if (isTest) {
    return;
  }

  const missing: string[] = [];
  const checks = [
    { name: 'SUPABASE_URL', value: rawConfig.database.url },
    { name: 'SUPABASE_KEY', value: rawConfig.database.key },
    { name: 'GOOGLE_ADS_CLIENT_ID', value: rawConfig.platforms.googleAds.clientId },
    { name: 'GOOGLE_ADS_DEVELOPER_TOKEN', value: rawConfig.platforms.googleAds.developerToken },
    { name: 'META_ADS_APP_ID', value: rawConfig.platforms.metaAds.appId },
    { name: 'JWT_SECRET', value: rawConfig.auth.jwtSecret },
  ];

  for (const check of checks) {
    const val = check.value;
    if (
      !val ||
      val.startsWith('mock-') ||
      val.includes('mock-supabase') ||
      val === 'default-super-secret-key-9988' ||
      val === 'mock-secret-key-12345'
    ) {
      missing.push(check.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `STARTUP ERROR: Missing or mock credentials found in non-test environment for: ${missing.join(', ')}. ` +
      `Please configure actual variables or copy .env.example to .env to populate credentials.`
    );
  }
}


