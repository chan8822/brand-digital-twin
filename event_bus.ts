/**
 * @fileoverview Global Event Bus for real-time event distribution.
 */

// taze: EventEmitter, events from //third_party/javascript/typings/node

import { EventEmitter } from "events";

export class RealtimeEventBus extends EventEmitter {
  emitPhaseUpdate(tenantId: string, actionId: string, phase: string, status: string, details?: any) {
    this.emit("event", {
      type: "phase_update",
      tenantId,
      actionId,
      phase,
      status,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  emitRiskAlert(tenantId: string, alertId: string, severity: string, message: string) {
    this.emit("event", {
      type: "risk_alert",
      tenantId,
      alertId,
      severity,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  emitRecommendation(tenantId: string, recommendationId: string, category: string, costImpact: number) {
    this.emit("event", {
      type: "recommendation",
      tenantId,
      recommendationId,
      category,
      costImpact,
      timestamp: new Date().toISOString(),
    });
  }
}

export const eventBus = new RealtimeEventBus();
