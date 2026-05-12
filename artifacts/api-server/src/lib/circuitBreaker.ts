import { logger } from "./logger";

/**
 * Task #8 — circuit breaker primitive for the dispatch loop.
 *
 * The ETA model is called inline by code paths the dispatcher
 * depends on. If it slows under load (e.g. a downstream regressor
 * starts taking 5 s per call) every dispatch decision blocks,
 * cascading into queue stall and STAT-SLA breaches.
 *
 * This breaker wraps any thunk in a 3-state machine:
 *
 *   CLOSED → call through; on N consecutive timeouts/errors → OPEN
 *   OPEN   → fail fast with the supplied fallback for `cooldownMs`
 *   HALF   → on next call, try once; success → CLOSED, failure → OPEN
 *
 * The breaker never throws — it always returns a result, either from
 * the wrapped call (within `timeoutMs`) or from `fallback()`. That
 * lets callers drop the breaker into a hot path without changing
 * their error semantics.
 */
export type BreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  cooldownMs: number;
  timeoutMs: number;
}

export interface BreakerCallResult<T> {
  value: T;
  source: "primary" | "fallback";
  reason?: "timeout" | "error" | "open";
  state: BreakerState;
  latencyMs: number;
}

export interface BreakerMetrics {
  state: BreakerState;
  consecutiveFailures: number;
  totalCalls: number;
  totalFailures: number;
  totalTimeouts: number;
  totalFallbacks: number;
  openedAt: number | null;
  lastStateChangeAt: number;
}

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private lastStateChangeAt = Date.now();
  private totalCalls = 0;
  private totalFailures = 0;
  private totalTimeouts = 0;
  private totalFallbacks = 0;
  // True while a HALF_OPEN probe is in flight — prevents a thundering
  // herd of concurrent callers from each running their own probe
  // against a degraded downstream the moment cooldown elapses.
  private probeInFlight = false;

  constructor(private readonly opts: CircuitBreakerOptions) {}

  metrics(): BreakerMetrics {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalTimeouts: this.totalTimeouts,
      totalFallbacks: this.totalFallbacks,
      openedAt: this.openedAt,
      lastStateChangeAt: this.lastStateChangeAt,
    };
  }

  /** Test/admin hook. Resets to CLOSED with zeroed counters. */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.lastStateChangeAt = Date.now();
    this.totalCalls = 0;
    this.totalFailures = 0;
    this.totalTimeouts = 0;
    this.totalFallbacks = 0;
    this.probeInFlight = false;
  }

  private transitionTo(next: BreakerState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.lastStateChangeAt = Date.now();
    if (next === "open") this.openedAt = Date.now();
    if (next === "closed") {
      this.openedAt = null;
      this.consecutiveFailures = 0;
    }
    logger.warn(
      { breaker: this.opts.name, from: prev, to: next },
      "circuit breaker state change",
    );
  }

  private maybeHalfOpen(): void {
    if (this.state !== "open") return;
    if (this.openedAt == null) return;
    if (Date.now() - this.openedAt >= this.opts.cooldownMs) {
      this.transitionTo("half_open");
    }
  }

  async call<T>(
    primary: () => Promise<T>,
    fallback: () => T | Promise<T>,
  ): Promise<BreakerCallResult<T>> {
    this.totalCalls++;
    this.maybeHalfOpen();

    // HALF_OPEN: only one probe in flight at a time. Concurrent
    // callers fall back so a thundering herd cannot re-saturate a
    // downstream that's just begun to recover.
    if (this.state === "half_open" && this.probeInFlight) {
      this.totalFallbacks++;
      const v = await fallback();
      return {
        value: v,
        source: "fallback",
        reason: "open",
        state: this.state,
        latencyMs: 0,
      };
    }
    if (this.state === "open") {
      this.totalFallbacks++;
      const v = await fallback();
      return {
        value: v,
        source: "fallback",
        reason: "open",
        state: this.state,
        latencyMs: 0,
      };
    }

    const isProbe = this.state === "half_open";
    if (isProbe) this.probeInFlight = true;
    const started = Date.now();
    try {
      const v = await this.race(primary());
      this.onSuccess();
      return {
        value: v,
        source: "primary",
        state: this.state,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const isTimeout = (err as Error).message === "__breaker_timeout__";
      if (isTimeout) this.totalTimeouts++;
      this.onFailure();
      this.totalFallbacks++;
      const v = await fallback();
      return {
        value: v,
        source: "fallback",
        reason: isTimeout ? "timeout" : "error",
        state: this.state,
        latencyMs: Date.now() - started,
      };
    } finally {
      if (isProbe) this.probeInFlight = false;
    }
  }

  private race<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("__breaker_timeout__")),
        this.opts.timeoutMs,
      );
      // Defensive: don't let the breaker timer keep node alive on shutdown.
      if (typeof t.unref === "function") t.unref();
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  private onSuccess(): void {
    if (this.state === "half_open") {
      this.transitionTo("closed");
      return;
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.totalFailures++;
    this.consecutiveFailures++;
    if (this.state === "half_open") {
      this.transitionTo("open");
      return;
    }
    if (this.consecutiveFailures >= this.opts.failureThreshold) {
      this.transitionTo("open");
    }
  }
}

/**
 * Singleton breaker for the ETA model. Tuned for the dispatch loop:
 *
 *   - timeoutMs 200 ms — well under the dispatch p95 budget.
 *   - failureThreshold 3 — survives transient blips; opens on a
 *     real degradation.
 *   - cooldownMs 5 s — gives a slow downstream a window to recover
 *     before we probe again.
 */
export const etaBreaker = new CircuitBreaker({
  name: "eta_model",
  failureThreshold: 3,
  cooldownMs: 5_000,
  timeoutMs: Number(process.env["ETA_BREAKER_TIMEOUT_MS"] ?? 200),
});
