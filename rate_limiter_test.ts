import 'jasmine';
import {TokenBucket, RateLimitingAdapterWrapper} from './rate_limiter';
import {PlatformAdapter, ActionPlan, ActionRequest, ActionResult} from './platform_adapter';

describe('TokenBucket with Fake Timers', () => {
  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(1700000000000));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should consume and refill tokens correctly', async () => {
    const bucket = new TokenBucket(3, 10); // 3 tokens, refill 10 per sec
    expect(bucket.getTokens()).toBe(3);

    await bucket.acquire();
    expect(bucket.getTokens()).toBe(2);

    await bucket.acquire();
    await bucket.acquire();
    expect(bucket.getTokens()).toBe(0);

    // tryAcquire when empty should fail
    expect(bucket.tryAcquire()).toBe(false);

    // Tick 110ms should give 1.1 tokens
    jasmine.clock().tick(110);
    expect(bucket.getTokens()).toBeCloseTo(1.1, 5);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.getTokens()).toBeCloseTo(0.1, 5);
  });

  it('should validate constructor parameters', () => {
    expect(() => new TokenBucket(0, 5)).toThrowError('Invalid bucket size or refill rate');
    expect(() => new TokenBucket(-1, 5)).toThrowError('Invalid bucket size or refill rate');
    expect(() => new TokenBucket(5, -1)).toThrowError('Invalid bucket size or refill rate');
  });

  it('should handle concurrency and debt recovery', async () => {
    const bucket = new TokenBucket(1, 10);
    await bucket.acquire(); // tokens = 0

    // Fire 2 concurrent acquisitions when empty
    const p1 = bucket.acquire();
    const p2 = bucket.acquire();

    // They should be waiting.
    // Tick 100ms to resolve them.
    jasmine.clock().tick(100);
    
    // Await them to ensure they resolve and flush microtasks
    await Promise.all([p1, p2]);
    
    expect(bucket.getTokens()).toBeCloseTo(-1, 5); // debt
  });
});

describe('RateLimitingAdapterWrapper (Real Timers)', () => {
  let mockAdapter: PlatformAdapter;
  let executionCount: number;
  let throwRateLimitOnce: boolean;
  let throwRateLimitAlways: boolean;

  beforeEach(() => {
    executionCount = 0;
    throwRateLimitOnce = false;
    throwRateLimitAlways = false;
    mockAdapter = {
      platform: 'mock',
      schemaVersion: '1.0',
      capabilities: [],
      read: async (since: Date) => {
        executionCount++;
        if (throwRateLimitAlways) {
          throw new Error('Rate Limit exceeded (429)');
        }
        if (throwRateLimitOnce) {
          throwRateLimitOnce = false;
          throw new Error('429 Too Many Requests');
        }
        return {data: 'ok'};
      },
      plan: async (req: ActionRequest) => { return {} as ActionPlan; },
      execute: async (plan: ActionPlan) => { return {} as ActionResult; },
      rollback: async (h: any) => { return {} as ActionResult; },
      healthCheck: async () => ({
        ok: true,
        latencyMs: 10,
        schemaDriftDetected: false,
        deprecationWarnings: [],
      }),
    };
  });

  it('should execute successfully without rate limits', async () => {
    const bucket = new TokenBucket(5, 10);
    const wrapper = new RateLimitingAdapterWrapper(mockAdapter, bucket);

    const res = await wrapper.read(new Date());
    expect(res).toEqual({data: 'ok'});
    expect(executionCount).toBe(1);
    expect(wrapper.totalCalls).toBe(1);
    expect(wrapper.retriedCalls).toBe(0);
    expect(wrapper.delayedCalls).toBe(0);
  });

  it('should retry on 429 and succeed', async () => {
    throwRateLimitOnce = true;
    const bucket = new TokenBucket(5, 10);
    // Use very small backoff (1ms) to keep test fast
    const wrapper = new RateLimitingAdapterWrapper(mockAdapter, bucket, 2, 1);

    const res = await wrapper.read(new Date());
    expect(res).toEqual({data: 'ok'});
    expect(executionCount).toBe(2);
    expect(wrapper.retriedCalls).toBe(1);
  });

  it('should fail after max retries exceeded', async () => {
    throwRateLimitAlways = true;
    const bucket = new TokenBucket(5, 10);
    const wrapper = new RateLimitingAdapterWrapper(mockAdapter, bucket, 2, 1);

    await expectAsync(wrapper.read(new Date())).toBeRejectedWithError(/429/);
    expect(executionCount).toBe(3);
    expect(wrapper.retriedCalls).toBe(2);
  });
});
