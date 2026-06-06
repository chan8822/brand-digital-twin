/**
 * @fileoverview CostSource interface definition.
 */

export type CostSourceProvider = 'tally' | 'zoho' | 'quickbooks' | 'xero' | 'manual';

export interface CostSource {
  provider: CostSourceProvider;
  getUnitCosts(tenantId: string): Promise<Array<{sku: string; unitCost: number}>>;
}
