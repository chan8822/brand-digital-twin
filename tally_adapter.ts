// Phase 3 — Tally ERP Adapter.
// Simulates extraction of cash ledgers and inventory journals from Tally Prime.

export interface TallyLedgerBalance {
  ledgerName: string;
  balance: number;
  type: 'DEBIT' | 'CREDIT';
  updatedAt: string;
}

export class TallyAdapter {
  readonly platform = 'tally';
  readonly schemaVersion = 'tally_prime@v2.0';

  private simulatedLedgers: Map<string, TallyLedgerBalance> = new Map();

  constructor(
    private tallyUrl: string, // URL of local/cloud Tally ERP gateway
    private tenantId: string,
  ) {
    this.simulatedLedgers.set('Cash in Hand', {
      ledgerName: 'Cash in Hand',
      balance: 154000.5,
      type: 'DEBIT',
      updatedAt: new Date().toISOString(),
    });
    this.simulatedLedgers.set('Purchase Account', {
      ledgerName: 'Purchase Account',
      balance: 85200.0,
      type: 'DEBIT',
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Fetches the current balance of a specific ledger.
   */
  async getLedgerBalance(ledgerName: string): Promise<TallyLedgerBalance> {
    // Intercept/mock during testing or if gateway offline
    if (this.tallyUrl === 'mock_tally_gateway') {
      return (
        this.simulatedLedgers.get(ledgerName) ?? {
          ledgerName,
          balance: 0,
          type: 'DEBIT',
          updatedAt: new Date().toISOString(),
        }
      );
    }

    try {
      const res = await fetch(
        `${this.tallyUrl}/ledger/${encodeURIComponent(ledgerName)}`,
      );
      if (!res.ok) throw new Error('Failed to contact Tally ERP Gateway');
      return (await res.json()) as TallyLedgerBalance;
    } catch {
      return (
        this.simulatedLedgers.get(ledgerName) ?? {
          ledgerName,
          balance: 0,
          type: 'DEBIT',
          updatedAt: new Date().toISOString(),
        }
      );
    }
  }

  /**
   * Simulates sync of inventory items to extract live unit costs (COGS anchor).
   */
  async getInventoryCosts(): Promise<Record<string, number>> {
    return {
      'variant_abc': 12.5,
      'variant_xyz': 45.0,
    };
  }
}
