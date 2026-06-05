import {PinoLogger} from './observability';
import {PlatformAccount} from './agency_os_types';

export class GoogleMerchantAdapter {
  readonly platform = 'google_merchant';
  readonly schemaVersion = 'content_api@v2.1';
  private readonly logger: PinoLogger;

  constructor(
    private merchantId: string,
    private tenantId: string,
    private token?: string,
    logger?: PinoLogger,
  ) {
    this.logger = logger || new PinoLogger();
  }

  async listSubMerchants(mcaId: string): Promise<PlatformAccount[]> {
    this.logger.info('Enumerating GMC sub-merchants', {mcaId});

    if (!this.token || this.merchantId.startsWith('mock') || mcaId.startsWith('mock') || this.token.startsWith('mock')) {
      if (mcaId !== 'gmc-mca-root') {
        return [];
      }

      const now = new Date().toISOString();
      return [
        {
          accountId: 'acc-gmc-mca-root',
          tenantId: this.tenantId,
          platform: 'google_merchant',
          platformAccountId: 'gmc-mca-root',
          accountName: 'Nike & Partners MCA',
          accountType: 'merchant_center',
          status: 'active',
          ingestedAt: now,
        },
        {
          accountId: 'acc-gmc-sub-a',
          tenantId: this.tenantId,
          platform: 'google_merchant',
          platformAccountId: 'gmc-sub-a',
          accountName: 'Nike US Shop Feed',
          accountType: 'merchant_center',
          parentAccountId: 'acc-gmc-mca-root',
          status: 'active',
          ingestedAt: now,
          currency: 'USD',
          timezone: 'America/New_York',
        },
        {
          accountId: 'acc-gmc-sub-b',
          tenantId: this.tenantId,
          platform: 'google_merchant',
          platformAccountId: 'gmc-sub-b',
          accountName: 'Nike UK Shop Feed',
          accountType: 'merchant_center',
          parentAccountId: 'acc-gmc-mca-root',
          status: 'active',
          ingestedAt: now,
          currency: 'GBP',
          timezone: 'Europe/London',
        },
        {
          accountId: 'acc-gmc-sub-c',
          tenantId: this.tenantId,
          platform: 'google_merchant',
          platformAccountId: 'gmc-sub-c',
          accountName: 'Adidas Shop Feed',
          accountType: 'merchant_center',
          parentAccountId: 'acc-gmc-mca-root',
          status: 'active',
          ingestedAt: now,
          currency: 'USD',
          timezone: 'America/New_York',
        },
      ];
    }

    try {
      const endpoint = `https://shoppingcontent.googleapis.com/content/v2.1/${mcaId}/accounts`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (!res.ok) {
        this.logger.error('GMC sub-merchant search failed', {
          status: res.status,
          statusText: res.statusText,
        });
        throw new Error(`Google Merchant Center accounts list error: ${res.statusText}`);
      }

      const json = (await res.json()) as any;
      const resources = json.resources || [];
      const platformAccounts: PlatformAccount[] = [];

      for (const account of resources) {
        platformAccounts.push({
          accountId: `acc-gmc-${account.id}`,
          tenantId: this.tenantId,
          platform: 'google_merchant',
          platformAccountId: String(account.id),
          accountName: account.name || null,
          accountType: 'merchant_center',
          parentAccountId: `acc-gmc-${mcaId}`,
          status: 'active',
          ingestedAt: new Date().toISOString(),
        });
      }

      return platformAccounts;
    } catch (err: any) {
      this.logger.error('GMC sub-merchant search failed with exception', {
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
