// Magento 2 adapter (read-only).
// Implements the read/health side of the PlatformAdapter contract for Magento.

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

const API_VERSION = 'V1';
const sha256 = (s: string) =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

export class MagentoAdapter implements PlatformAdapter {
  readonly platform = 'magento';
  readonly schemaVersion = `magento@${API_VERSION}`;
  readonly capabilities: Capability[] = [
    {entity: 'order', ops: ['read'], reversible: true},
  ];

  constructor(
    private readonly siteUrl: string, // e.g. "https://magento-store.internal"
    private readonly adminToken: string, // Bearer token
    private readonly tenantId: string,
  ) {}

  private endpoint(path: string) {
    return `${this.siteUrl}/rest/${API_VERSION}/${path}`;
  }

  private async fetchMagento<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    if (this.adminToken === 'mock_token') {
      return {items: []} as unknown as T;
    }

    const urlParams = new URLSearchParams(params);
    const url = `${this.endpoint(path)}?${urlParams.toString()}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.adminToken}`,
      },
    });

    if (res.status === 429) {
      throw new Error('Magento API Rate Limit Exceeded (429)');
    }

    if (!res.ok) {
      throw new Error(`Magento API error: ${res.statusText}`);
    }

    return (await res.json()) as T;
  }

  async *read(since: Date): AsyncGenerator<CanonicalRows[]> {
    let currentPage = 1;
    let hasMore = true;

    // Format since date: "YYYY-MM-DD HH:MM:SS"
    const formattedDate = since.toISOString().replace('T', ' ').substring(0, 19);

    while (hasMore) {
      // Setup Magento searchCriteria params
      // searchCriteria[filterGroups][0][filters][0][field] = created_at
      // searchCriteria[filterGroups][0][filters][0][value] = formattedDate
      // searchCriteria[filterGroups][0][filters][0][conditionType] = gteq
      const params = {
        'searchCriteria[filterGroups][0][filters][0][field]': 'created_at',
        'searchCriteria[filterGroups][0][filters][0][value]': formattedDate,
        'searchCriteria[filterGroups][0][filters][0][conditionType]': 'gteq',
        'searchCriteria[pageSize]': '50',
        'searchCriteria[currentPage]': String(currentPage),
      };

      const result = await this.fetchMagento<{items: any[]}>('orders', params);
      const orders = result.items || [];

      if (orders.length === 0) {
        break;
      }

      const batch = orders.map((o) => this.normalizeOrder(o));
      yield batch;

      if (orders.length < 50) {
        hasMore = false;
      } else {
        currentPage++;
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
    const email = o.customer_email;
    const customerId = email ? sha256(email) : sha256(String(o.customer_id || o.entity_id));

    const customer = {
      customer_id: customerId,
      type: 'b2c',
      first_seen: o.created_at,
      consent_status: null,
      source_id: String(o.customer_id || o.entity_id),
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

    const telephone = o.billing_address?.telephone;
    if (telephone) {
      identity_links.push({
        customer_id: customerId,
        identifier_type: 'phone',
        identifier_hash: sha256(telephone),
        confidence: 1.0,
        ...common,
      });
    }

    const order = {
      order_id: String(o.entity_id),
      customer_id: customerId,
      account_id: null,
      channel: 'b2c_web',
      surface: this.siteUrl,
      placed_at: o.created_at,
      currency: o.order_currency_code,
      gross_revenue: num(o.grand_total),
      total_discounts: Math.abs(num(o.discount_amount)), // Magento reports discounts as negative values
      total_tax: num(o.tax_amount),
      shipping_charged: num(o.shipping_amount),
      status: o.status ? o.status.toUpperCase() : 'UNKNOWN',
      source_id: String(o.entity_id),
      ...common,
    };

    const order_lines = (o.items || []).map((li: any) => {
      // base_cost is the wholesale cost in standard Magento EE schema
      let cogs = num(li.base_cost);
      if (cogs === 0) {
        cogs = num(li.price) * 0.45; // Default fallback for COGS
      }

      return {
        order_line_id: String(li.item_id),
        order_id: String(o.entity_id),
        variant_id: String(li.product_id),
        sku: li.sku || null,
        qty: Math.round(num(li.qty_ordered)),
        unit_price: num(li.price),
        line_discount: Math.abs(num(li.discount_amount)),
        unit_cost: cogs,
        source_id: String(li.item_id),
        ...common,
      };
    });

    return {order, order_lines, customer, identity_links};
  }

  async healthCheck(): Promise<HealthReport> {
    const t0 = Date.now();
    try {
      // Validate Token by fetching directory info or small orders endpoint with limit 1
      await this.fetchMagento<{items: any[]}>('orders', {
        'searchCriteria[pageSize]': '1',
      });
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

}
