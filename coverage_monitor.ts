import {SupabaseClient} from './supabase_client';
import {BrandSignal} from './agency_os_types';

export class CoverageMonitor {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Compares shopify orders vs sGTM purchases inside a specific window.
   * If sGTM collection degradation exceeds 15%, a critical signal is triggered.
   */
  async checkSignalLoss(
    tenantId: string,
    windowDays: number,
  ): Promise<{
    degradationPct: number;
    alertTriggered: boolean;
    ordersCount: number;
    purchasesCount: number;
  }> {
    const orders = await this.db.getOrders(tenantId);
    const touchpoints = await this.db.getTouchpoints(tenantId);

    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    // Filter ground-truth orders in window
    const ordersInWindow = orders.filter((o) => {
      const placedTime = new Date(o.placed_at).getTime();
      return now - placedTime <= windowMs;
    });

    // Filter purchase touchpoints received from sGTM in window
    const purchasesInWindow = touchpoints.filter((t) => {
      const tpTime = new Date(t.occurred_at).getTime();
      return (
        t.type === 'purchase' &&
        t.source_system === 'sgtm' &&
        now - tpTime <= windowMs
      );
    });

    const ordersCount = ordersInWindow.length;
    const purchasesCount = purchasesInWindow.length;

    if (ordersCount === 0) {
      return {
        degradationPct: 0,
        alertTriggered: false,
        ordersCount: 0,
        purchasesCount: 0,
      };
    }

    const degradationPct = ((ordersCount - purchasesCount) / ordersCount) * 100;
    const alertTriggered = degradationPct > 15.0;

    if (alertTriggered) {
      const signal: BrandSignal = {
        signalId: `sig-loss-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        tenantId,
        source: 'social', // Classified as data/social operations source
        type: 'signal_loss_alert',
        severity: 'critical',
        message: `Signal degradation of ${degradationPct.toFixed(1)}% detected between first-party sGTM and Shopify (expected: ${ordersCount}, collected: ${purchasesCount})`,
        payload: {
          degradationPct,
          expectedOrders: ordersCount,
          collectedPurchases: purchasesCount,
        },
        timestamp: Date.now(),
      };
      await this.db.saveBrandSignal(signal);
    }

    return {
      degradationPct,
      alertTriggered,
      ordersCount,
      purchasesCount,
    };
  }
}
