/**
 * @fileoverview Global Event Bus with Token Bucket rate limiting and delay queues.
 */

// taze: EventEmitter, events from //third_party/javascript/typings/node

import {EventEmitter} from 'events';

export class RealtimeEventBus extends EventEmitter {
  private buckets = new Map<string, {tokens: number; lastRefill: number}>();
  private eventQueues = new Map<string, any[]>();
  private queueTimer?: NodeJS.Timeout;

  // Rate limiter limits: 10 burst capacity, refilling 5 tokens per second
  private readonly maxTokens = 10;
  private readonly refillRate = 5;

  private allowEmit(tenantId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(tenantId);
    if (!bucket) {
      bucket = {tokens: this.maxTokens, lastRefill: now};
      this.buckets.set(tenantId, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(
        this.maxTokens,
        bucket.tokens + elapsedSec * this.refillRate,
      );
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1.0) {
      bucket.tokens -= 1.0;
      return true;
    }
    return false;
  }

  private routeEvent(tenantId: string, event: any) {
    if (this.allowEmit(tenantId) && (!this.eventQueues.get(tenantId)?.length)) {
      this.emit('event', event);
    } else {
      this.queueEvent(tenantId, event);
    }
  }

  private queueEvent(tenantId: string, event: any) {
    let q = this.eventQueues.get(tenantId);
    if (!q) {
      q = [];
      this.eventQueues.set(tenantId, q);
    }
    q.push(event);
    this.startQueueRunner();
  }

  private startQueueRunner() {
    if (this.queueTimer) return;
    this.queueTimer = setInterval(() => {
      let active = false;
      for (const [tenantId, q] of this.eventQueues.entries()) {
        if (q.length > 0) {
          active = true;
          if (this.allowEmit(tenantId)) {
            const ev = q.shift();
            if (ev) {
              this.emit('event', ev);
            }
          }
        }
      }
      if (!active) {
        clearInterval(this.queueTimer!);
        this.queueTimer = undefined;
      }
    }, 100);
  }

  override emit(eventName: string | symbol, ...args: any[]): boolean {
    const listeners = this.rawListeners(eventName);
    if (listeners.length === 0) {
      return false;
    }
    for (const listener of listeners) {
      try {
        if (typeof listener === 'function') {
          listener.apply(this, args);
        }
      } catch (err: any) {
        console.error(`Error in listener for event ${String(eventName)}:`, err);
      }
    }
    return true;
  }

  emitPhaseUpdate(
    tenantId: string,
    actionId: string,
    phase: string,
    status: string,
    details?: any,
  ) {
    this.routeEvent(tenantId, {
      type: 'phase_update',
      tenantId,
      actionId,
      phase,
      status,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  emitRiskAlert(
    tenantId: string,
    alertId: string,
    severity: string,
    message: string,
  ) {
    this.routeEvent(tenantId, {
      type: 'risk_alert',
      tenantId,
      alertId,
      severity,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  emitRecommendation(
    tenantId: string,
    recommendationId: string,
    category: string,
    costImpact: number,
  ) {
    this.routeEvent(tenantId, {
      type: 'recommendation',
      tenantId,
      recommendationId,
      category,
      costImpact,
      timestamp: new Date().toISOString(),
    });
  }

  // Cleanup helper for tests
  cleanup() {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = undefined;
    }
    this.buckets.clear();
    this.eventQueues.clear();
  }
}

export const eventBus = new RealtimeEventBus();
