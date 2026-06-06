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

  async getProductFeed(merchantId: string): Promise<any[]> {
    this.logger.info('Fetching GMC product feed', {merchantId});

    if (!this.token || this.merchantId.startsWith('mock') || merchantId.startsWith('mock') || this.token.startsWith('mock')) {
      return [
        {
          id: 'prod-a',
          title: 'Premium Organic Energy Bar',
          brand: 'NutraBoost',
          gtin: '123456789012',
          price: {value: '29.99', currency: 'USD'},
          shipping: [{country: 'US', price: {value: '5.00', currency: 'USD'}}],
          googleProductCategory: 'Food > Energy Bars',
          link: 'https://nutraboost.com/products/energy-bar',
        },
        {
          id: 'prod-b',
          title: 'Hydration Electrolyte Powder',
          brand: 'NutraBoost',
          price: {value: '19.99', currency: 'USD'},
          shipping: [{country: 'US', price: {value: '3.00', currency: 'USD'}}],
          googleProductCategory: 'Food > Supplements',
          link: 'https://nutraboost.com/products/hydration-powder',
          // Missing GTIN
        },
        {
          id: 'prod-c',
          title: 'Daily Vitamin Pack',
          brand: 'NutraBoost',
          gtin: '987654321098',
          price: {value: '39.99', currency: 'USD'},
          shipping: [], // Missing shipping rules
          googleProductCategory: 'Health > Vitamins',
          link: 'https://nutraboost.com/products/vitamin-pack',
        },
        {
          id: 'prod-d',
          title: 'Organic Green Tea Extract',
          brand: 'NutraBoost',
          gtin: '555666777888',
          price: {value: '15.00', currency: 'EUR'}, // Currency mismatch with target market USD
          shipping: [{country: 'US', price: {value: '4.00', currency: 'USD'}}],
          googleProductCategory: 'Food > Beverages',
          link: 'https://nutraboost.com/products/green-tea',
        },
      ];
    }

    try {
      const endpoint = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`GMC Content API products request failed: ${res.statusText}`);
      }

      const json = (await res.json()) as any;
      return json.resources || [];
    } catch (err: any) {
      this.logger.error('GMC product feed fetch failed', {
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
