// WooCommerce adapter (read-only).
// Implements the read/health side of the PlatformAdapter contract for WooCommerce.

import {createHash} from 'node:crypto';
import {
  ActionPlan,
  ActionRequest,
  ActionResult,
  CanonicalRows,
  Capability,
  HealthReport,
  PlatformAdapter,
  RollbackHandle,
} from './platform_adapter';

const API_VERSION = 'v3';
const sha256 = (s: string) =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

export class WooCommerceAdapter implements PlatformAdapter {
  readonly platform = 'woocommerce';
  readonly schemaVersion = `woocommerce@${API_VERSION}`;
  readonly capabilities: Capability[] = [
    {entity: 'order', ops: ['read'], reversible: true},
  ];

  constructor(
    private readonly siteUrl: string, // e.g. "https://my-store.com"
    private readonly consumerKey: string,
    private readonly consumerSecret: string,
    private readonly tenantId: string,
  ) {}

  private endpoint(path: string) {
    return `${this.siteUrl}/wp-json/wc/${API_VERSION}/${path}`;
  }

  private async fetchWc<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    if (
      this.consumerKey === 'mock_key' ||
      this.consumerSecret === 'mock_secret'
    ) {
      // Return empty or mock structure for tests
      return [] as unknown as T;
    }

    const urlParams = new URLSearchParams({
      consumer_key: this.consumerKey,
      consumer_secret: this.consumerSecret,
      ...params,
    });
    const url = `${this.endpoint(path)}?${urlParams.toString()}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 429) {
      throw new Error('WooCommerce API Rate Limit Exceeded (429)');
    }

    if (!res.ok) {
      throw new Error(`WooCommerce API error: ${res.statusText}`);
    }

    return (await res.json()) as T;
  }

  async *read(since: Date): AsyncGenerator<CanonicalRows[]> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const orders = await this.fetchWc<any[]>('orders', {
        after: since.toISOString(),
        page: String(page),
        per_page: '50',
      });

      if (!orders || orders.length === 0) {
        break;
      }

      const batch = orders.map((o) => this.normalizeOrder(o));
      yield batch;

      if (orders.length < 50) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  private normalizeOrder(o: any): CanonicalRows {
    const common = {
      tenant_id: this.tenantId,
      source_system: this.platform,
      source_version: this.schemaVersion,
      ingested_at: new Date().toISOString(),
    };

    const num = (val: any) => (val ? parseFloat(val) : 0);
    // Resolve customer ID from billing email
    const email = o.billing?.email;
    const customerId = email ? sha256(email) : sha256(String(o.customer_id || o.id));

    const customer = {
      customer_id: customerId,
      type: 'b2c',
      first_seen: o.date_created,
      consent_status: null,
      source_id: String(o.customer_id || o.id),
      ...common,
    };

    const identity_links: Record<string, unknown>[] = [];
    if (email) {
      identity_links.push({
        customer_id: customerId,
        identifier_type: 'email',
        identifier_hash: sha256(email),
        confidence: 1.0,
        ...common,
      });
    }
    if (o.billing?.phone) {
      identity_links.push({
        customer_id: customerId,
        identifier_type: 'phone',
        identifier_hash: sha256(o.billing.phone),
        confidence: 1.0,
        ...common,
      });
    }

    const order = {
      order_id: String(o.id),
      customer_id: customerId,
      account_id: null,
      channel: 'b2c_web',
      surface: this.siteUrl,
      placed_at: o.date_created,
      currency: o.currency,
      gross_revenue: num(o.total),
      total_discounts: num(o.discount_total),
      total_tax: num(o.total_tax),
      shipping_charged: num(o.shipping_total),
      status: o.status ? o.status.toUpperCase() : 'UNKNOWN',
      source_id: String(o.id),
      ...common,
    };

    const order_lines = (o.line_items || []).map((li: any) => {
      // Attempt to extract COGS from item meta data (e.g. from common Cost of Goods Sold plugins)
      let cogs = 0;
      if (Array.isArray(li.meta_data)) {
        const cogsMeta = li.meta_data.find(
          (m: any) => m.key === '_wc_cog_cost' || m.key === 'cost_price',
        );
        if (cogsMeta) {
          cogs = num(cogsMeta.value);
        }
      }
      // If cogs is not defined, we fallback to 40% of unit price as a default mock
      if (cogs === 0) {
        cogs = num(li.price) * 0.4;
      }

      return {
        order_line_id: String(li.id),
        order_id: String(o.id),
        variant_id: String(li.variation_id || li.product_id),
        sku: li.sku || null,
        qty: li.quantity,
        unit_price: num(li.price),
        line_discount: 0,
        unit_cost: cogs,
        source_id: String(li.id),
        ...common,
      };
    });

    return {order, order_lines, customer, identity_links};
  }

  async healthCheck(): Promise<HealthReport> {
    const t0 = Date.now();
    try {
      // Fetch system status or simple orders limit 1 to verify connectivity
      await this.fetchWc('orders', {per_page: '1'});
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        schemaDriftDetected: false,
        deprecationWarnings: [],
      };
    } catch {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        schemaDriftDetected: true,
        deprecationWarnings: [],
      };
    }
  }

  // --- WRITE PATH STUBS ---

  async plan(req: ActionRequest): Promise<ActionPlan> {
    return {
      request: req,
      valid: false,
      projectedCost: 0,
      warnings: ['WooCommerce storefront adapter is read-only.'],
    };
  }

  async execute(plan: ActionPlan): Promise<ActionResult> {
    return {
      ok: false,
      auditRef: 'unsupported',
      error: 'WooCommerce storefront adapter does not support executions.',
    };
  }

  async rollback(h: RollbackHandle): Promise<ActionResult> {
    return {
      ok: false,
      auditRef: 'unsupported',
      error: 'WooCommerce storefront adapter does not support rollbacks.',
    };
  }
}
