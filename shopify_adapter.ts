// Phase 0 — Shopify adapter (read-only).
// Implements the read/health side of the PlatformAdapter contract.
// Declares NO write capabilities: plan/execute/rollback are absent by design in Phase 0.
// Everything downstream sees canonical rows, never the Shopify API shape (the adapter dependency rule).

import {createHash} from 'node:crypto';

// --- Minimal slice of the adapter contract used in Phase 0 ---
export type Op = 'read';
export interface Capability {
  entity: string;
  ops: Op[];
  reversible: boolean;
}
export interface HealthReport {
  ok: boolean;
  latencyMs: number;
  rateLimitRemaining?: number;
  schemaDriftDetected: boolean;
  deprecations: string[];
}
export interface CanonicalRows {
  // one normalized order fans out into these table rows
  order: Record<string, unknown>;
  order_lines: Record<string, unknown>[];
  customer?: Record<string, unknown>;
  identity_links: Record<string, unknown>[];
}

const API_VERSION = '2025-10';
const sha256 = (s: string) =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

export class ShopifyAdapter {
  readonly platform = 'shopify';
  readonly schemaVersion = 'shopify@2025-10';
  readonly capabilities: Capability[] = [
    {entity: 'order', ops: ['read'], reversible: true}, // read-only; no write ops declared
  ];

  constructor(
    private shop: string, // e.g. "ableys.myshopify.com"
    private token: string, // Admin API access token (read scopes only)
    private tenantId: string,
  ) {}

  private endpoint() {
    return `https://${this.shop}/admin/api/${API_VERSION}/graphql.json`;
  }

  // GraphQL with cost-based throttle handling (Shopify returns a cost budget per call).
  private async gql<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.token,
        },
        body: JSON.stringify({query, variables}),
      });

      if (res.status === 429) {
        // Rate limited. Shopify returns retry-after header.
        const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        throw new Error(`Shopify API error: ${res.statusText}`);
      }

      const json = (await res.json()) as any;
      if (json.errors) {
        throw new Error(
          `Shopify GraphQL error: ${JSON.stringify(json.errors)}`,
        );
      }

      // Cost throttling logic
      const cost = json.extensions?.cost;
      if (cost) {
        const remaining = cost.throttleStatus.currentlyAvailable;
        if (remaining < cost.requestedQueryCost) {
          const restoreRate = cost.throttleStatus.restoreRate;
          const sleepMs = Math.ceil(
            ((cost.requestedQueryCost - remaining) / restoreRate) * 1000,
          );
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
        }
      }

      return json.data as T;
    }
  }

  async *read(since: Date): AsyncGenerator<CanonicalRows[]> {
    let hasNextPage = true;
    let cursor: string | null = null;

    const query = `
      query GetOrders($since: String!, $cursor: String) {
        orders(first: 50, after: $cursor, query: "created_at:>=:'$since'") {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            processedAt
            currencyCode
            displayFinancialStatus
            totalPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            totalTaxSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
            customer {
              id
              email
              phone
            }
            lineItems(first: 100) {
              nodes {
                id
                quantity
                discountedUnitPriceSet { shopMoney { amount } }
                variant {
                  id
                  sku
                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    while (hasNextPage) {
      const data: any = await this.gql<{orders: any}>(query, {
        since: since.toISOString(),
        cursor,
      });

      if (!data || !data.orders) {
        break;
      }

      const batch = data.orders.nodes.map((o: any) => this.normalizeOrder(o));
      yield batch;

      hasNextPage = data.orders.pageInfo.hasNextPage;
      cursor = data.orders.pageInfo.endCursor;
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
    const customerId = o.customer?.id ? sha256(o.customer.id) : null;

    const customer = customerId
      ? {
          customer_id: customerId,
          type: 'b2c',
          first_seen: o.processedAt,
          consent_status: null,
          source_id: customerId,
          ...common,
        }
      : undefined;

    const identity_links: Record<string, unknown>[] = [];
    if (customerId && o.customer?.email) {
      identity_links.push({
        customer_id: customerId,
        identifier_type: 'email',
        identifier_hash: sha256(o.customer.email),
        confidence: 1.0,
        ...common,
      });
    }
    if (customerId && o.customer?.phone) {
      identity_links.push({
        customer_id: customerId,
        identifier_type: 'phone',
        identifier_hash: sha256(o.customer.phone),
        confidence: 1.0,
        ...common,
      });
    }

    const order = {
      order_id: o.id,
      customer_id: customerId,
      account_id: null,
      channel: 'b2c_web',
      surface: this.shop,
      placed_at: o.processedAt,
      currency: o.currencyCode,
      gross_revenue: num(o.totalPriceSet?.shopMoney?.amount),
      total_discounts: num(o.totalDiscountsSet?.shopMoney?.amount),
      total_tax: num(o.totalTaxSet?.shopMoney?.amount),
      shipping_charged: num(o.totalShippingPriceSet?.shopMoney?.amount),
      status: o.displayFinancialStatus,
      source_id: o.id,
      ...common,
    };

    const order_lines = o.lineItems.nodes.map((li: any) => ({
      order_line_id: li.id,
      order_id: o.id,
      variant_id: li.variant?.id ?? null,
      sku: li.variant?.sku ?? null,
      qty: li.quantity,
      unit_price: num(li.discountedUnitPriceSet?.shopMoney?.amount),
      line_discount: 0,
      unit_cost: num(li.variant?.inventoryItem?.unitCost?.amount), // COGS straight from source
      source_id: li.id,
      ...common,
    }));

    return {order, order_lines, customer, identity_links};
  }

  // --- HEALTH: the sensor the self-healing loop reads ---
  async healthCheck(): Promise<HealthReport> {
    const t0 = Date.now();
    try {
      const data = await this.gql<any>(`query { shop { name } }`);
      return {
        ok: !!data?.shop?.name,
        latencyMs: Date.now() - t0,
        schemaDriftDetected: false,
        deprecations: [],
      };
    } catch {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        schemaDriftDetected: true,
        deprecations: [],
      };
    }
  }
}
