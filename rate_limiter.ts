/**
 * @fileoverview Token Bucket rate limiter and rate-limiting platform adapter wrapper.
 */

import {
  ActionPlan,
  ActionRequest,
  ActionResult,
  Capability,
  HealthReport,
  PlatformAdapter,
  RollbackHandle,
} from './platform_adapter';

/**
 * Token Bucket implementation for rate limiting requests.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    public readonly maxTokens: number,
    public readonly refillRatePerSec: number,
  ) {
    if (maxTokens <= 0 || refillRatePerSec < 0) {
      throw new Error('Invalid bucket size or refill rate');
    }
    this.tokens = maxTokens;
    this.lastRefillMs = Date.now();
  }

  /**
   * Refills the tokens in the bucket based on elapsed time.
   */
  private refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    this.lastRefillMs = now;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsedSec * this.refillRatePerSec,
    );
  }

  /**
   * Acquires 1 token. Resolves immediately if available, otherwise waits.
   */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time
    const needed = 1 - this.tokens;
    const waitMs = (needed / this.refillRatePerSec) * 1000;
    return new Promise((resolve) => {
      setTimeout(() => {
        this.refill();
        this.tokens -= 1;
        resolve();
      }, waitMs);
    });
  }

  /**
   * Tries to acquire 1 token. Returns true if acquired, false otherwise (without blocking).
   */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Returns current token count (primarily for tests).
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * PlatformAdapter wrapper that decorates any adapter with rate limiting and exponential backoff.
 */
export class RateLimitingAdapterWrapper implements PlatformAdapter {
  readonly platform: string;
  readonly schemaVersion: string;
  readonly capabilities: Capability[];

  // Metrics
  public totalCalls = 0;
  public delayedCalls = 0;
  public retriedCalls = 0;

  constructor(
    private readonly delegate: PlatformAdapter,
    private readonly limiter: TokenBucket,
    private readonly maxRetries = 3,
    private readonly initialBackoffMs = 50,
  ) {
    this.platform = delegate.platform;
    this.schemaVersion = delegate.schemaVersion;
    this.capabilities = delegate.capabilities;
  }

  private async callWithLimiterAndRetry<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;
    const tokensBefore = this.limiter.getTokens();
    if (tokensBefore < 1) {
      this.delayedCalls++;
    }

    await this.limiter.acquire();

    let attempts = 0;
    while (true) {
      try {
        return await fn();
      } catch (err: unknown) {
        attempts++;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          errMsg.includes('Rate Limit') || errMsg.includes('429');

        if (isRateLimit && attempts <= this.maxRetries) {
          this.retriedCalls++;
          const backoff = this.initialBackoffMs * Math.pow(2, attempts - 1);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, backoff);
          });
          continue;
        }
        throw err;
      }
    }
  }

  read(since: Date): Promise<any> {
    if (!this.delegate.read) {
      throw new Error(`Delegate platform '${this.platform}' does not support read operations.`);
    }
    const readFn = this.delegate.read;
    return this.callWithLimiterAndRetry(
      () => Promise.resolve(readFn.call(this.delegate, since)) as Promise<any>,
    );
  }

  plan(req: ActionRequest): Promise<ActionPlan> {
    if (!this.delegate.plan) {
      throw new Error(`Delegate platform '${this.platform}' does not support plan operations.`);
    }
    const planFn = this.delegate.plan;
    return this.callWithLimiterAndRetry(() => planFn.call(this.delegate, req));
  }

  execute(plan: ActionPlan): Promise<ActionResult> {
    if (!this.delegate.execute) {
      throw new Error(`Delegate platform '${this.platform}' does not support execute operations.`);
    }
    const executeFn = this.delegate.execute;
    return this.callWithLimiterAndRetry(() => executeFn.call(this.delegate, plan));
  }

  rollback(h: RollbackHandle): Promise<ActionResult> {
    if (!this.delegate.rollback) {
      throw new Error(`Delegate platform '${this.platform}' does not support rollback operations.`);
    }
    const rollbackFn = this.delegate.rollback;
    return this.callWithLimiterAndRetry(() => rollbackFn.call(this.delegate, h));
  }

  healthCheck(): Promise<HealthReport> {
    return this.delegate.healthCheck();
  }
}
