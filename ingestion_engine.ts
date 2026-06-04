import {PlatformAdapter} from './platform_adapter';
import {
  CustomerEntry,
  FulfillmentCostEntry,
  IdentityLinkEntry,
  OrderEntry,
  OrderLineEntry,
  RefundEntry,
  SupabaseClient,
} from './supabase_client';

export class IngestionEngine {
  constructor(private readonly db: SupabaseClient) {}

  async sync(adapter: PlatformAdapter, since: Date): Promise<void> {
    if (!adapter.read) {
      throw new Error(`Platform adapter '${adapter.platform}' does not support read ingestion.`);
    }
    const readResult = adapter.read(since);

    if (readResult && typeof (readResult as any)[Symbol.asyncIterator] === 'function') {
      for await (const batch of readResult as any) {
        await this.persistBatch(adapter.platform, batch);
      }
    } else {
      const data = await readResult;
      await this.persistBatch(adapter.platform, data);
    }
  }

  private async persistBatch(platform: string, data: any): Promise<void> {
    await this.db.beginTransaction();
    try {
      if (platform === 'shopify') {
        const rows = Array.isArray(data) ? data : [data];
        for (const row of rows) {
          if (row.order) {
            await this.db.saveOrder(row.order as OrderEntry);
          }
          if (row.order_lines && Array.isArray(row.order_lines)) {
            for (const line of row.order_lines) {
              await this.db.saveOrderLine(line as OrderLineEntry);
            }
          }
          if (row.customer) {
            await this.db.saveCustomer(row.customer as CustomerEntry);
          }
          if (row.identity_links && Array.isArray(row.identity_links)) {
            for (const link of row.identity_links) {
              await this.db.saveIdentityLink(link as IdentityLinkEntry);
            }
          }
          // Optionally handle refunds & fulfillment costs if structured in Shopify row
          if (row.refunds && Array.isArray(row.refunds)) {
            for (const ref of row.refunds) {
              await this.db.saveRefund(ref as RefundEntry);
            }
          }
          if (row.fulfillment_costs && Array.isArray(row.fulfillment_costs)) {
            for (const cost of row.fulfillment_costs) {
              await this.db.saveFulfillmentCost(cost as FulfillmentCostEntry);
            }
          }
        }
      } else if (platform === 'google_ads' || platform === 'meta_ads') {
        // Handle campaigns & spend facts
        if (data.campaigns && Array.isArray(data.campaigns)) {
          for (const camp of data.campaigns) {
            await this.db.saveCampaign(camp);
          }
        }
        if (data.spend_facts && Array.isArray(data.spend_facts)) {
          for (const fact of data.spend_facts) {
            await this.db.saveSpendFact(fact);
          }
        }
      }
      await this.db.commitTransaction();
    } catch (err) {
      await this.db.rollbackTransaction();
      throw err;
    }
  }
}
