import 'jasmine';
import * as http from 'http';
import {createHash} from 'node:crypto';

import {CoverageMonitor} from './coverage_monitor';
import {startServer} from './server';
import {SupabaseClient} from './supabase_client';

function sha256(s: string): string {
  return createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
}

interface EventPayload {
  tenantId: string;
  eventName: string;
  clientId?: string;
  gclid?: string;
  customerData?: {
    email?: string;
    phone?: string;
  };
  consent?: {
    adStorage: 'granted' | 'denied';
    adUserData: 'granted' | 'denied';
    analyticsStorage: 'granted' | 'denied';
  };
  orderId?: string;
}

describe('Phase 1b Google Tag Gateway & sGTM Server-Side tagging', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9989;
  const baseUrl = `http://localhost:${PORT}`;
  const tenantId = 'tenant_measurement_spine';

  beforeAll(() => {
    db = new SupabaseClient();
    server = startServer(PORT, db);
  });

  afterAll((done) => {
    server.close(done);
  });

  function getRaw(path: string): Promise<{status: number; data: string; headers: http.IncomingHttpHeaders}> {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            data,
            headers: res.headers,
          });
        });
      }).on('error', reject);
    });
  }

  function postJson(
    path: string,
    body: EventPayload,
    headers?: Record<string, string>,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request(
        {
          hostname: 'localhost',
          port: PORT,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            ...headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          });
        },
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  it('serves Javascript container script via GET /api/v1/gtg', async () => {
    const res = await getRaw('/api/v1/gtg?id=GTM-XYZ99');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/javascript');
    expect(res.data).toContain("GTM-XYZ99");
    expect(res.data).toContain("Google Tag Gateway active");
  });

  it('ingests pixel events and resolves identities with Granted Consent', async () => {
    // Post an event with granted consent
    const response = await postJson('/api/v1/sgtm/events', {
      tenantId,
      eventName: 'page_view',
      clientId: 'device-cookie-abc',
      gclid: 'gclid-123456',
      customerData: {
        email: 'nike_buyer@gmail.com',
        phone: '+15559876543',
      },
      consent: {
        adStorage: 'granted',
        adUserData: 'granted',
        analyticsStorage: 'granted',
      },
    });

    expect(response.status).toBe('success');
    expect(response.data.status).toBe('collected');
    expect(response.data.customerId).toBe(sha256('nike_buyer@gmail.com')); // First email input resolved to customerId

    // Verify DB states: customer, identity links, touchpoints
    const customers = await db.getCustomers(tenantId);
    const buyerProfile = customers.find((c) => c.customer_id === response.data.customerId);
    expect(buyerProfile).toBeDefined();
    expect(buyerProfile?.consent_status).toBe('GRANTED');

    const links = await db.getIdentityLinks(tenantId);
    const emailLink = links.find((l) => l.identifier_hash === sha256('nike_buyer@gmail.com'));
    expect(emailLink).toBeDefined();
    expect(emailLink?.identifier_type).toBe('email');

    const phoneLink = links.find((l) => l.identifier_hash === sha256('+15559876543'));
    expect(phoneLink).toBeDefined();
    expect(phoneLink?.identifier_type).toBe('phone');

    const touchpoints = await db.getTouchpoints(tenantId);
    const tp = touchpoints.find((t) => t.touchpoint_id === response.data.touchpointId);
    expect(tp).toBeDefined();
    expect(tp?.campaign_id).toBe('camp-gclid-123456'); // click parameter traced
    expect(tp?.type).toBe('page_view');
  });

  it('redacts PII and strips tracking under Denied Consent', async () => {
    const response = await postJson('/api/v1/sgtm/events', {
      tenantId,
      eventName: 'purchase',
      clientId: 'device-cookie-xyz',
      gclid: 'gclid-99999',
      customerData: {
        email: 'secret_buyer@gmail.com',
        phone: '+15550000000',
      },
      consent: {
        adStorage: 'denied', // Redact click_id
        adUserData: 'denied', // Redact PII (email/phone)
        analyticsStorage: 'granted',
      },
    });

    expect(response.status).toBe('success');
    expect(response.data.status).toBe('collected');

    // Customer ID should be generated anonymously based on device client ID
    expect(response.data.customerId).toBe(sha256('device-cookie-xyz'));

    // Check DB does NOT contain link hashes for email or phone
    const links = await db.getIdentityLinks(tenantId);
    const emailLink = links.find((l) => l.identifier_hash === sha256('secret_buyer@gmail.com'));
    expect(emailLink).toBeUndefined();

    // Verify touchpoint contains null campaign ID due to denied adStorage consent
    const touchpoints = await db.getTouchpoints(tenantId);
    const tp = touchpoints.find((t) => t.touchpoint_id === response.data.touchpointId);
    expect(tp).toBeDefined();
    expect(tp?.campaign_id).toBeNull();
    expect(tp?.type).toBe('purchase');
  });

  it('triggers BrandSignal alert on high signal loss / degradation', async () => {
    const monitorTenant = 'tenant_monitor_signal_loss';
    const monitorDb = db.clone();
    monitorDb.setTenantContext(monitorTenant);

    // Save 10 orders (ground truth Shopify)
    for (let i = 1; i <= 10; i++) {
      await monitorDb.saveOrder({
        order_id: `ord-gt-${i}`,
        customer_id: 'cust-xyz',
        account_id: null,
        channel: 'b2c_web',
        surface: 'shop.com',
        placed_at: new Date().toISOString(),
        currency: 'USD',
        gross_revenue: 100,
        total_discounts: 0,
        total_tax: 5,
        shipping_charged: 0,
        status: 'PAID',
        tenant_id: monitorTenant,
        source_system: 'shopify',
        source_id: `ord-gt-${i}`,
        source_version: 'v1',
        ingested_at: new Date().toISOString(),
      });
    }

    // Save only 7 purchases from sGTM (30% degradation / signal loss)
    for (let i = 1; i <= 7; i++) {
      await monitorDb.saveTouchpoint({
        touchpoint_id: `tp-p-${i}`,
        customer_id: 'cust-xyz',
        campaign_id: null,
        order_id: `ord-gt-${i}`,
        occurred_at: new Date().toISOString(),
        type: 'purchase',
        tenant_id: monitorTenant,
        source_system: 'sgtm',
        ingested_at: new Date().toISOString(),
      });
    }

    const monitor = new CoverageMonitor(monitorDb);
    const result = await monitor.checkSignalLoss(monitorTenant, 1);

    expect(result.degradationPct).toBe(30.0);
    expect(result.alertTriggered).toBe(true);

    // Check if BrandSignal alert was created in DB
    const signals = await monitorDb.getBrandSignals(monitorTenant);
    const alertSignal = signals.find((s) => s.type === 'signal_loss_alert');
    expect(alertSignal).toBeDefined();
    expect(alertSignal?.severity).toBe('critical');
    expect(alertSignal?.message).toContain('Signal degradation of 30.0% detected');
  });
});
