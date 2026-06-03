/**
 * @fileoverview Brand Digital Twin Global Configuration Management.
 */

// taze: process from //third_party/javascript/typings/node

export const config = {
  server: {
    port: Number(process.env['PORT'] || '3000'),
    env: process.env['NODE_ENV'] || 'development',
  },
  auth: {
    jwtSecret: process.env['JWT_SECRET'] || 'default-super-secret-key-9988',
  },
  database: {
    url:
      process.env['SUPABASE_URL'] || 'https://mock-supabase.brandtwin.internal',
    key: process.env['SUPABASE_KEY'] || 'mock-secret-key-12345',
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
      rateLimitMax: Number(process.env['GOOGLE_ADS_RATE_LIMIT_MAX'] || '10'),
      rateLimitRefillRate: Number(
        process.env['GOOGLE_ADS_RATE_LIMIT_REFILL_RATE'] || '2',
      ),
    },
    metaAds: {
      appId: process.env['META_ADS_APP_ID'] || 'mock-meta-app-id',
    },
  },
  rateLimit: {
    maxRequests: Number(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
    refillRatePerSec: Number(
      process.env['RATE_LIMIT_REFILL_RATE_PER_SEC'] || '1.666',
    ),
  },
};
