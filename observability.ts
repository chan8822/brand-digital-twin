export interface Span {
  traceId: string;
  spanId: string;
  parentId?: string;
  operationName: string;
  platform: string;
  startTimeMs: number;
  endTimeMs?: number;
  durationMs?: number;
  status: 'success' | 'failure';
  error?: string;
}

export interface Metric {
  name: string;
  platform: string;
  value: number;
  timestamp: string;
}

import {redactSensitiveData} from './scrubber';
export {redactSensitiveData};

export interface ErrorEvent {
  tenant_id: string | null;
  severity: 'error' | 'warning' | 'critical';
  source: string;
  message: string;
  context?: any;
  trace_id?: string;
}

export interface ErrorSink {
  recordError(event: ErrorEvent): Promise<void>;
}

export interface ErrorDbClient {
  saveErrorEvent(event: any): Promise<void>;
}

export class DatabaseErrorSink implements ErrorSink {
  constructor(private readonly db: ErrorDbClient) {}

  async recordError(event: ErrorEvent): Promise<void> {
    const redactedMessage = redactSensitiveData(event.message);
    const redactedContext = redactSensitiveData(event.context);
    await this.db.saveErrorEvent({
      event_id: `err_${Math.random().toString(36).substring(7)}`,
      tenant_id: event.tenant_id,
      severity: event.severity,
      source: event.source,
      message: redactedMessage,
      context: redactedContext,
      trace_id: event.trace_id || null,
      created_at: new Date().toISOString(),
    });
  }
}

export class WebhookErrorSink implements ErrorSink {
  constructor(private readonly webhookUrl: string) {}

  async recordError(event: ErrorEvent): Promise<void> {
    const redactedMessage = redactSensitiveData(event.message);
    const redactedContext = redactSensitiveData(event.context);
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...event,
          message: redactedMessage,
          context: redactedContext,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Fail-silent
    }
  }
}

export class MetricsTracker {
  private spans: Span[] = [];
  private metrics: Metric[] = [];
  private alerts: string[] = [];
  private errorSink?: ErrorSink;

  constructor(errorSink?: ErrorSink) {
    this.errorSink = errorSink;
  }

  setErrorSink(sink: ErrorSink) {
    this.errorSink = sink;
  }

  startSpan(operationName: string, platform: string, parentId?: string): Span {
    const span: Span = {
      traceId: Math.random().toString(36).substring(7),
      spanId: Math.random().toString(36).substring(7),
      parentId,
      operationName,
      platform,
      startTimeMs: Date.now(),
      status: 'success',
    };
    this.spans.push(span);
    return span;
  }

  endSpan(spanId: string, status: 'success' | 'failure', error?: string, tenantId?: string | null, context?: any) {
    const span = this.spans.find((s) => s.spanId === spanId);
    if (span) {
      span.endTimeMs = Date.now();
      span.durationMs = span.endTimeMs - span.startTimeMs;
      span.status = status;
      span.error = error;

      this.recordMetric({
        name: `${span.operationName}_latency_ms`,
        platform: span.platform,
        value: span.durationMs,
        timestamp: new Date().toISOString(),
      });

      if (status === 'failure' && this.errorSink) {
        this.errorSink.recordError({
          tenant_id: tenantId || null,
          severity: 'error',
          source: span.operationName,
          message: error || 'Operation failed',
          context,
          trace_id: span.traceId,
        }).catch(() => {});
      }
      this.evaluateRules();
    }
  }

  recordMetric(metric: Metric) {
    this.metrics.push(metric);
    this.evaluateRules();
  }

  evaluateRules() {
    const pendingJobsBacklog = this.metrics
      .filter((m) => m.name === 'pending_jobs_backlog_count')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

    if (pendingJobsBacklog && pendingJobsBacklog.value > 50) {
      this.raiseAlert(
        `CRITICAL: Job queue backlog size is ${pendingJobsBacklog.value}, exceeding safety threshold of 50.`
      );
    }

    const last10Spans = [...this.spans].slice(-10);
    if (last10Spans.length > 0) {
      const avgLatency = last10Spans.reduce((acc, s) => acc + (s.durationMs ?? 0), 0) / last10Spans.length;
      if (avgLatency > 5000) {
        this.raiseAlert(
          `WARNING: Average operation latency across last ${last10Spans.length} requests is ${avgLatency.toFixed(1)}ms, exceeding budget of 5000ms.`
        );
      }

      const failures = last10Spans.filter((s) => s.status === 'failure').length;
      const failureRate = failures / last10Spans.length;
      if (failureRate > 0.1) {
        this.raiseAlert(
          `CRITICAL: Operation failure rate is ${(failureRate * 100).toFixed(1)}% (last ${last10Spans.length} requests), exceeding threshold of 10%.`
        );
      }
    }
  }

  raiseAlert(message: string) {
    const alert = `[ALERT] [${new Date().toISOString()}] ${message}`;
    this.alerts.push(alert);
  }

  getAlerts(): string[] {
    return this.alerts;
  }

  getSpans(): Span[] {
    return this.spans;
  }

  getMetrics(): Metric[] {
    return this.metrics;
  }

  getAverageLatency(platform: string, operation: string): number {
    const related = this.spans.filter(
      (s) =>
        s.platform === platform &&
        s.operationName === operation &&
        s.durationMs !== undefined,
    );
    if (related.length === 0) return 0;
    const sum = related.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    return sum / related.length;
  }
}

/**
 * Pino-compatible structured JSON logger for NDJSON analysis.
 */
export class PinoLogger {
  // Store logged entries in-memory for unit testing
  public readonly loggedEntries: string[] = [];

  constructor(
    private readonly minLevel: 10 | 20 | 30 | 40 | 50 = 30,
    private readonly mockConsole = true,
  ) {}

  private log(
    level: number,
    msg: string,
    context: Record<string, unknown> = {},
  ) {
    if (level < this.minLevel) return;

    const redactedMsg = redactSensitiveData(msg);
    const redactedContext = redactSensitiveData(context);

    const entry = JSON.stringify({
      level,
      time: Date.now(),
      msg: redactedMsg,
      ...redactedContext,
    });

    this.loggedEntries.push(entry);

    if (!this.mockConsole) {
      console.log(entry);
    }
  }

  trace(msg: string, context?: Record<string, unknown>) {
    this.log(10, msg, context);
  }

  debug(msg: string, context?: Record<string, unknown>) {
    this.log(20, msg, context);
  }

  info(msg: string, context?: Record<string, unknown>) {
    this.log(30, msg, context);
  }

  warn(msg: string, context?: Record<string, unknown>) {
    this.log(40, msg, context);
  }

  error(msg: string, context?: Record<string, unknown>) {
    this.log(50, msg, context);
  }
}
