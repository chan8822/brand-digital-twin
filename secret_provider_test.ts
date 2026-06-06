import 'jasmine';
import {EnvSecretProvider} from './env_secret_provider';
import {ManagedSecretProvider, VaultClient} from './managed_secret_provider';
import {validateEnv} from './config';

describe('Secret Provider', () => {
  describe('EnvSecretProvider', () => {
    let originalEnvValue: string | undefined;

    beforeEach(() => {
      originalEnvValue = process.env['TEST_ENV_VAR'];
    });

    afterEach(() => {
      if (originalEnvValue !== undefined) {
        process.env['TEST_ENV_VAR'] = originalEnvValue;
      } else {
        delete process.env['TEST_ENV_VAR'];
      }
    });

    it('should resolve secret from process.env', async () => {
      process.env['TEST_ENV_VAR'] = 'my-super-secret-value';
      const provider = new EnvSecretProvider();
      const val = await provider.getSecret('TEST_ENV_VAR');
      expect(val).toBe('my-super-secret-value');
    });

    it('should return empty string if key is not defined in env', async () => {
      delete process.env['TEST_ENV_VAR'];
      const provider = new EnvSecretProvider();
      const val = await provider.getSecret('TEST_ENV_VAR');
      expect(val).toBe('');
    });

    it('should trim leading/trailing whitespace and newlines from resolved env vars', async () => {
      process.env['TEST_ENV_VAR'] = ' \n my-trimmed-secret-value \r\n ';
      const provider = new EnvSecretProvider();
      const val = await provider.getSecret('TEST_ENV_VAR');
      expect(val).toBe('my-trimmed-secret-value');
    });
  });

  describe('ManagedSecretProvider', () => {
    it('should retrieve secrets from the vault client and cache them with TTL', async () => {
      let callCount = 0;
      const mockVault: VaultClient = {
        async fetchSecret(secretName: string): Promise<string> {
          callCount++;
          if (secretName === 'SOME_SECRET') {
            return `secret-value-${callCount}`;
          }
          return '';
        },
      };

      const provider = new ManagedSecretProvider(mockVault, 1000); // 1s TTL

      // First call should fetch from vault
      const val1 = await provider.getSecret('SOME_SECRET');
      expect(val1).toBe('secret-value-1');
      expect(callCount).toBe(1);

      // Second call within TTL should hit cache
      const val2 = await provider.getSecret('SOME_SECRET');
      expect(val2).toBe('secret-value-1');
      expect(callCount).toBe(1);

      // Wait for TTL expiration (1.1s)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Third call after TTL should trigger new vault call
      const val3 = await provider.getSecret('SOME_SECRET');
      expect(val3).toBe('secret-value-2');
      expect(callCount).toBe(2);
    });

    it('coalesces concurrent requests to the same key to avoid cache stampede', async () => {
      let callCount = 0;
      let resolvePromise: (value: string) => void;
      const deferred = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });

      const mockVault: VaultClient = {
        async fetchSecret(secretName: string): Promise<string> {
          callCount++;
          return deferred;
        },
      };

      const provider = new ManagedSecretProvider(mockVault, 1000);

      // Trigger 3 concurrent fetches
      const p1 = provider.getSecret('STAMPEDE_KEY');
      const p2 = provider.getSecret('STAMPEDE_KEY');
      const p3 = provider.getSecret('STAMPEDE_KEY');

      resolvePromise!('secret-value');

      const results = await Promise.all([p1, p2, p3]);
      expect(results[0]).toBe('secret-value');
      expect(results[1]).toBe('secret-value');
      expect(results[2]).toBe('secret-value');
      expect(callCount).toBe(1); // Only 1 fetch triggered
    });

    it('serves stale cached value on fetch error', async () => {
      let fail = false;
      const mockVault: VaultClient = {
        async fetchSecret(secretName: string): Promise<string> {
          if (fail) throw new Error('Vault offline');
          return 'fresh-value';
        },
      };

      const provider = new ManagedSecretProvider(mockVault, 10); // short TTL

      // First successful fetch
      const val1 = await provider.getSecret('KEY');
      expect(val1).toBe('fresh-value');

      // Wait for TTL expiration
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Trigger failure
      fail = true;
      const val2 = await provider.getSecret('KEY');
      expect(val2).toBe('fresh-value'); // returns stale cached value instead of throwing
    });

    it('supports cache invalidation API', async () => {
      let callCount = 0;
      const mockVault: VaultClient = {
        async fetchSecret(secretName: string): Promise<string> {
          callCount++;
          return `value-${callCount}`;
        },
      };

      const provider = new ManagedSecretProvider(mockVault, 1000);
      const val1 = await provider.getSecret('KEY');
      expect(val1).toBe('value-1');

      provider.invalidate('KEY');

      const val2 = await provider.getSecret('KEY');
      expect(val2).toBe('value-2'); // fetched again
      expect(callCount).toBe(2);
    });

    it('prunes least recently used keys when max size is exceeded', async () => {
      const mockVault: VaultClient = {
        async fetchSecret(secretName: string): Promise<string> {
          return `val-${secretName}`;
        },
      };

      const provider = new ManagedSecretProvider(mockVault, 1000, 3); // Max size 3

      await provider.getSecret('k1');
      await provider.getSecret('k2');
      await provider.getSecret('k3');

      // Access k1 to make it recently used (k2 becomes oldest)
      await provider.getSecret('k1');

      // Add k4 (should trigger pruning of k2)
      await provider.getSecret('k4');

      // Let's invalidate a local test check by verifying if a call triggers fetch on k2
      // We can count vault calls to verify k2 was pruned
      let fetchCount = 0;
      const mockVaultPrune: VaultClient = {
        async fetchSecret(secretName: string): Promise<string> {
          fetchCount++;
          return `val-${secretName}`;
        },
      };
      const providerPrune = new ManagedSecretProvider(mockVaultPrune, 1000, 3);

      await providerPrune.getSecret('k1');
      await providerPrune.getSecret('k2');
      await providerPrune.getSecret('k3');
      
      // Access k1 to refresh LRU
      await providerPrune.getSecret('k1');
      
      // k1, k2, k3 are in cache. LRU order: k2, k3, k1.
      // Fetch k4. This prunes k2.
      await providerPrune.getSecret('k4');

      fetchCount = 0;
      await providerPrune.getSecret('k1'); // should hit cache
      expect(fetchCount).toBe(0);

      fetchCount = 0;
      await providerPrune.getSecret('k2'); // should miss cache and fetch
      expect(fetchCount).toBe(1);
    });
  });

  describe('Config Mock Protection and validateEnv', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env['NODE_ENV'];
    });

    afterEach(() => {
      if (originalNodeEnv !== undefined) {
        process.env['NODE_ENV'] = originalNodeEnv;
      } else {
        delete process.env['NODE_ENV'];
      }
    });

    it('should not throw in test mode even with mock values', () => {
      process.env['NODE_ENV'] = 'test';
      // validateEnv should return silently in test mode
      expect(() => validateEnv()).not.toThrow();
    });

    it('should throw startup error in production mode if required secrets are mock or missing', () => {
      process.env['NODE_ENV'] = 'production';
      const globalRecord = globalThis as unknown as Record<string, unknown>;
      const originalJasmine = globalRecord['jasmine'];
      delete globalRecord['jasmine'];

      try {
        expect(() => validateEnv()).toThrowError(/STARTUP ERROR: Missing or mock credentials found/);
      } finally {
        globalRecord['jasmine'] = originalJasmine;
      }
    });
  });
});
