/**
 * @fileoverview Brand Digital Twin Global Configuration Management.
 */

// taze: process from //third_party/javascript/typings/node

export const config = {
  server: {
    port: Number(process.env['PORT'] || '3000'),
    env: process.env['NODE_ENV'] || 'development',
    baseUrl: process.env['BASE_URL'] || 'http://localhost:3000',
  },
  auth: {
    jwtSecret: process.env['JWT_SECRET'] || 'default-super-secret-key-9988',
    masterKey:
      process.env['MASTER_KEY'] || Buffer.alloc(32, 'a').toString('base64'),
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

export function validateEnv() {
  const isTest =
    process.env['NODE_ENV'] === 'test' ||
    typeof (globalThis as any)['jasmine'] !== 'undefined';
  if (isTest) {
    return;
  }

  const missing: string[] = [];
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'META_ADS_APP_ID',
    'JWT_SECRET',
  ];

  for (const v of requiredVars) {
    const val = process.env[v];
    if (!val || val.startsWith('mock-') || val.includes('mock-supabase') || val === 'default-super-secret-key-9988' || val === 'mock-secret-key-12345') {
      missing.push(v);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `STARTUP ERROR: Missing or mock credentials found in non-test environment for: ${missing.join(', ')}. ` +
      `Please configure actual variables or copy .env.example to .env to populate credentials.`
    );
  }
}

// Automatically validate env on start
validateEnv();

