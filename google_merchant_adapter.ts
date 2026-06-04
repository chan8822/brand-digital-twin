import {PinoLogger} from './observability';
import {PlatformAccount} from './agency_os_types';

export class GoogleMerchantAdapter {
  readonly platform = 'google_merchant';
  readonly schemaVersion = 'content_api@v2.1';
  private readonly logger: PinoLogger;

  constructor(
    private merchantId: string,
    private tenantId: string,
    logger?: PinoLogger,
  ) {
    this.logger = logger || new PinoLogger();
  }

  async listSubMerchants(mcaId: string): Promise<PlatformAccount[]> {
    this.logger.info('Simulating GMC sub-merchants enumeration', {mcaId});

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
        // Custom domain details attached in simulation
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
}
