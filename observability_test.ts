import 'jasmine';
import {
  redactSensitiveData,
  DatabaseErrorSink,
  MetricsTracker,
  ErrorDbClient,
  ErrorEvent,
} from './observability';
import {eventBus} from './event_bus';

describe('Observability & Durable Error Sink Suite (P1.2a)', () => {
  describe('Central Redaction Scrubber', () => {
    it('should recursively redact sensitive keys case-insensitively', () => {
      const input = {
        tenantId: 'tenant-123',
        credentials: {
          apiKey: 'key_123456789',
          clientSecret: 'secret_abcdef',
          accessToken: 'token_jwt_like',
          password: 'my-super-secret-password',
        },
        metadata: {
          auth_header: 'Bearer my-token',
          nested: [
            {
              refresh_token: 'refresh_xyz',
              safeField: 'hello',
            }
          ]
        }
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.tenantId).toBe('tenant-123');
      expect(redacted.credentials.apiKey).toBe('[REDACTED]');
      expect(redacted.credentials.clientSecret).toBe('[REDACTED]');
      expect(redacted.credentials.accessToken).toBe('[REDACTED]');
      expect(redacted.credentials.password).toBe('[REDACTED]');
      expect(redacted.metadata.auth_header).toBe('[REDACTED]');
      expect(redacted.metadata.nested[0].refresh_token).toBe('[REDACTED]');
      expect(redacted.metadata.nested[0].safeField).toBe('hello');
    });

    it('should redact JWT tokens and credit card numbers found in string values', () => {
      const jwtToken = 'header.payload.signature';
      const creditCard = '4111-1111-1111-1111';

      const input = {
        message: 'Transaction failed',
        details: {
          tokenValue: jwtToken,
          cardNum: creditCard,
          regularText: 'Normal message here',
        }
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.details.tokenValue).toBe('[REDACTED]');
      expect(redacted.details.cardNum).toBe('[REDACTED]');
      expect(redacted.details.regularText).toBe('Normal message here');
    });
  });

  describe('DatabaseErrorSink & MetricsTracker integration', () => {
    let mockDb: jasmine.SpyObj<ErrorDbClient>;
    let sink: DatabaseErrorSink;
    let tracker: MetricsTracker;

    beforeEach(() => {
      mockDb = jasmine.createSpyObj<ErrorDbClient>('ErrorDbClient', ['saveErrorEvent']);
      mockDb.saveErrorEvent.and.returnValue(Promise.resolve());
      sink = new DatabaseErrorSink(mockDb);
      tracker = new MetricsTracker(sink);
    });

    it('should write redacted error event on span failures', async () => {
      const span = tracker.startSpan('compute_poas', 'google_ads');
      
      const sensitiveContext = {
        api_key: 'super-secret-key',
        platform: 'google_ads',
        cost: 150.5,
      };

      tracker.endSpan(span.spanId, 'failure', 'API connection reset', 'tenant-a', sensitiveContext);

      // Verify saveErrorEvent was called with redacted context and the span traceId
      expect(mockDb.saveErrorEvent).toHaveBeenCalled();
      const event = mockDb.saveErrorEvent.calls.first().args[0];
      
      expect(event.event_id).toBeDefined();
      expect(event.tenant_id).toBe('tenant-a');
      expect(event.severity).toBe('error');
      expect(event.source).toBe('compute_poas');
      expect(event.message).toBe('API connection reset');
      expect(event.trace_id).toBe(span.traceId);
      expect(event.context.api_key).toBe('[REDACTED]');
      expect(event.context.platform).toBe('google_ads');
      expect(event.context.cost).toBe(150.5);
    });
  });

  describe('Real-time Alert Evaluation Rules (P1.2b)', () => {
    let tracker: MetricsTracker;

    beforeEach(() => {
      tracker = new MetricsTracker();
    });

    it('should raise a critical alert when job backlog count exceeds 50', () => {
      tracker.recordMetric({
        name: 'pending_jobs_backlog_count',
        platform: 'engine',
        value: 60,
        timestamp: new Date().toISOString(),
      });

      const alerts = tracker.getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0]).toContain('CRITICAL');
      expect(alerts[0]).toContain('backlog size is 60');
    });

    it('should raise a critical alert and emit circuit breaker event when tenant failure rate exceeds 5%', () => {
      const tenantId = 'tenant-breaker-test';
      let eventEmitted = false;
      eventBus.on('circuit_breaker_tripped', (id) => {
        if (id === tenantId) {
          eventEmitted = true;
        }
      });

      // Create 8 success spans
      for (let i = 0; i < 8; i++) {
        const s = tracker.startSpan('compute_poas', 'google_ads');
        tracker.endSpan(s.spanId, 'success', undefined, tenantId);
      }

      // Create 2 failure spans (failure rate = 20%)
      for (let i = 0; i < 2; i++) {
        const s = tracker.startSpan('compute_poas', 'google_ads');
        tracker.endSpan(s.spanId, 'failure', 'API Timeout', tenantId);
      }

      const alerts = tracker.getAlerts();
      const failureAlerts = alerts.filter(a => a.includes('exceeding threshold of 5%') && a.includes(tenantId));
      expect(failureAlerts.length).toBeGreaterThan(0);
      expect(eventEmitted).toBe(true);
    });

    it('should raise a warning alert when average operation latency exceeds 5000ms', () => {
      // Create 10 spans with simulated high latency
      for (let i = 0; i < 10; i++) {
        const s = tracker.startSpan('compute_poas', 'google_ads');
        // Manually adjust start time to mock high latency
        s.startTimeMs = Date.now() - 6000; 
        tracker.endSpan(s.spanId, 'success');
      }

      const alerts = tracker.getAlerts();
      const latencyAlerts = alerts.filter(a => a.includes('latency across last 10 requests'));
      expect(latencyAlerts.length).toBeGreaterThan(0);
    });
  });
});
