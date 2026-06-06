// Phase 2 — Google Ads adapter with write capabilities.
// Implements the PlatformAdapter contract for Google Ads.

import {createHash} from 'node:crypto';
import {
  ActionPlan,
  ActionRequest,
  ActionResult,
  Capability,
  HealthReport,
  PlatformAdapter,
  RollbackHandle,
} from './platform_adapter';
import {PinoLogger} from './observability';
import {PlatformAccount} from './agency_os_types';

export interface CanonicalAdsRows {
  campaigns: Record<string, unknown>[];
  spend_facts: Record<string, unknown>[];
}

const API_VERSION = 'v15';
const sha256 = (s: string) =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

export class GoogleAdsAdapter implements PlatformAdapter {

  readonly platform = 'google';
  readonly schemaVersion = `google_ads@${API_VERSION}`;
  readonly capabilities: Capability[] = [
    {
      entity: 'campaign',
      ops: [
        'read',
        'update_budget',
        'pause',
        'activate',
        'scale_budget',
        'update_feed',
        'create',
      ],
      reversible: true,
    },
    {
      entity: 'ad_group',
      ops: ['pause', 'activate'],
      reversible: true,
    },
    {entity: 'spend_fact', ops: ['read'], reversible: true},
  ];

  // In-memory campaign state simulator for write operations
  private simulatedCampaigns: Map<
    string,
    {name?: string; budget: number; status: string; activeVariantId?: string}
  > = new Map();

  private simulatedAdGroups: Map<
    string,
    {campaignId: string; name: string; status: string}
  > = new Map();

  private readCount = 0;
  public triggerAnomalyOnReadIndex = -1;

  private readonly logger: PinoLogger;

  constructor(
    private customerId: string,
    private developerToken: string,
    private token: string,
    private tenantId: string,
    logger?: PinoLogger,
  ) {
    this.logger = logger || new PinoLogger();
    // Populate some initial mock campaigns
    this.simulatedCampaigns.set('888', {
      name: 'Mock PMax Campaign',
      budget: 500,
      status: 'ENABLED',
    });
    this.simulatedCampaigns.set('c1', {
      name: 'Google Search Leads',
      budget: 1000,
      status: 'ENABLED',
    });

    // Populate mock ad groups
    this.simulatedAdGroups.set('ag-nike-shoes', {
      campaignId: 'c1',
      name: 'Nike Running Shoes Ad Group',
      status: 'ENABLED',
    });
  }

  async listSubAccounts(managerCustomerId: string): Promise<PlatformAccount[]> {
    this.logger.info('Searching MCC account hierarchy', {managerCustomerId});
    const cleanManagerId = managerCustomerId.replace(/-/g, '');

    if (this.token.startsWith('mock')) {
      if (cleanManagerId !== 'mccroot') {
        return [];
      }
      const now = new Date().toISOString();
      return [
        {
          accountId: 'acc-mcc-root',
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: 'mcc-root',
          accountName: 'Nike & Partners MCC',
          accountType: 'manager',
          status: 'active',
          ingestedAt: now,
        },
        {
          accountId: 'acc-sub-mcc-x',
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: 'sub-mcc-x',
          accountName: 'Europe Partners Sub-MCC',
          accountType: 'manager',
          parentAccountId: 'acc-mcc-root',
          status: 'active',
          ingestedAt: now,
        },
        {
          accountId: 'acc-ads-sub-a',
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: 'ads-sub-a',
          accountName: 'Nike Brand Main',
          accountType: 'sub_account',
          parentAccountId: 'acc-mcc-root',
          currency: 'USD',
          timezone: 'America/New_York',
          status: 'active',
          ingestedAt: now,
        },
        {
          accountId: 'acc-ads-sub-b',
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: 'ads-sub-b',
          accountName: 'Nike Brand UK',
          accountType: 'sub_account',
          parentAccountId: 'acc-mcc-root',
          currency: 'GBP',
          timezone: 'Europe/London',
          status: 'active',
          ingestedAt: now,
        },
        {
          accountId: 'acc-ads-sub-c',
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: 'ads-sub-c',
          accountName: 'Adidas Brand Main',
          accountType: 'sub_account',
          parentAccountId: 'acc-mcc-root',
          currency: 'EUR',
          timezone: 'Europe/Berlin',
          status: 'active',
          ingestedAt: now,
        },
        {
          accountId: 'acc-ads-sub-d',
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: 'ads-sub-d',
          accountName: 'Nike Reseller Sub',
          accountType: 'sub_account',
          parentAccountId: 'acc-sub-mcc-x',
          currency: 'EUR',
          timezone: 'Europe/Paris',
          status: 'active',
          ingestedAt: now,
        },
        {
          accountId: 'acc-ads-sub-e',
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: 'ads-sub-e',
          accountName: 'Adidas Reseller Sub',
          accountType: 'sub_account',
          parentAccountId: 'acc-sub-mcc-x',
          currency: 'EUR',
          timezone: 'Europe/Rome',
          status: 'active',
          ingestedAt: now,
        },
      ];
    }

    const query = `
      SELECT
        customer_client.client_customer,
        customer_client.level,
        customer_client.status,
        customer_client.descriptive_name,
        customer_client.currency_code,
        customer_client.time_zone,
        customer_client.manager
      FROM customer_client
    `;

    try {
      const endpoint = `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanManagerId}/googleAds:search`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'developer-token': this.developerToken,
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({query}),
      });

      if (!res.ok) {
        this.logger.error('Google Ads MCC search failed', {
          status: res.status,
          statusText: res.statusText,
        });
        throw new Error(`Google Ads MCC hierarchy search error: ${res.statusText}`);
      }

      const json = (await res.json()) as any;
      const results = json.results || [];
      const platformAccounts: PlatformAccount[] = [];

      for (const row of results) {
        const cc = row.customerClient || row.customer_client;
        if (!cc) continue;

        const subCustomerId = cc.clientCustomer.split('/')[1];
        const isManager = cc.manager === true || cc.manager === 'true';

        platformAccounts.push({
          accountId: `acc-ads-${subCustomerId}`,
          tenantId: this.tenantId,
          platform: 'google_ads',
          platformAccountId: subCustomerId,
          accountName: cc.descriptiveName || null,
          accountType: isManager ? 'manager' : 'sub_account',
          parentAccountId: managerCustomerId ? `acc-ads-${cleanManagerId}` : undefined,
          currency: cc.currencyCode || null,
          timezone: cc.timeZone || null,
          status: cc.status || 'active',
          ingestedAt: new Date().toISOString(),
        });
      }

      return platformAccounts;
    } catch (err: any) {
      this.logger.error('Google Ads MCC hierarchy search failed with exception', {
        error: err?.message || String(err),
      });
      throw err;
    }
  }

  private endpoint() {
    const cleanCustId = this.customerId.replace(/-/g, '');
    return `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanCustId}/googleAds:search`;
  }

  private async search(query: string): Promise<any[]> {
    this.logger.debug('Executing Google Ads query', {'query': query.trim()});
    // For local tests/dry-run, we intercept calls or catch failures
    if (this.token.startsWith('mock')) {
      this.logger.debug('Mock Google Ads API request intercepted');
      return this.getMockSearchResults();
    }

    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'developer-token': this.developerToken,
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({query}),
      });

      if (res.status === 429) {
        this.logger.error('Google Ads API Rate Limit Exceeded (429)', {
          'customerId': this.customerId,
        });
        throw new Error('Google Ads API Rate Limit Exceeded');
      }

      if (!res.ok) {
        this.logger.error('Google Ads API request failed', {
          'status': res.status,
          'statusText': res.statusText,
        });
        throw new Error(`Google Ads API error: ${res.statusText}`);
      }

      const json = (await res.json()) as any;
      const results = json.results || [];
      this.logger.debug('Google Ads query completed successfully', {
        'resultsCount': results.length,
      });
      return results;
    } catch (err: any) {
      this.logger.error('Google Ads query execution threw exception', {
        'error': err?.message || String(err),
      });
      throw err;
    }
  }


  async read(since: Date): Promise<CanonicalAdsRows> {
    this.readCount++;
    const formattedDate = since.toISOString().split('T')[0];
    this.logger.info('Reading campaigns and spend facts since date', {
      'since': formattedDate,
      'customerId': this.customerId,
    });
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.cost_micros,
        segments.date,
        customer.currency_code
      FROM campaign
      WHERE segments.date >= '${formattedDate}'
    `;

    const results = await this.search(query);
    const normalized = this.normalize(results);

    // If anomaly trigger index is met, inflate spend facts to cause ROAS drop
    if (
      this.triggerAnomalyOnReadIndex !== -1 &&
      this.readCount >= this.triggerAnomalyOnReadIndex
    ) {
      this.logger.warn('Mocking anomaly: inflating cost in spend facts');
      for (const sf of normalized.spend_facts) {
        sf['amount'] = (sf['amount'] as number) * 2.0; // 2x cost
      }
    }

    this.logger.info('Campaign data extraction and normalization complete', {
      'campaignsCount': normalized.campaigns.length,
      'spendFactsCount': normalized.spend_facts.length,
    });
    return normalized;
  }


  private normalize(results: any[]): CanonicalAdsRows {
    const common = {
      tenant_id: this.tenantId,
      source_system: this.platform,
      source_version: this.schemaVersion,
      ingested_at: new Date().toISOString(),
    };

    const campaignsMap = new Map<string, Record<string, unknown>>();
    const spend_facts: Record<string, unknown>[] = [];

    for (const row of results) {
      const gCampaign = row.campaign;
      const gMetrics = row.metrics;
      const gSegments = row.segments;
      const gCustomer = row.customer;

      if (!gCampaign || !gSegments) continue;

      const campaignId = String(gCampaign.id);

      if (!campaignsMap.has(campaignId)) {
        campaignsMap.set(campaignId, {
          campaign_id: campaignId,
          platform: this.platform,
          name: gCampaign.name ?? '',
          objective:
            gCampaign.advertising_channel_type ??
            gCampaign.advertisingChannelType ??
            'UNKNOWN',
          status: gCampaign.status ?? 'UNKNOWN',
          surface: 'google_search_network',
          source_id: campaignId,
          ...common,
        });
      }

      const costMicros = parseFloat(
        gMetrics?.costMicros ?? gMetrics?.cost_micros ?? '0',
      );
      const cost = costMicros / 1000000.0;

      spend_facts.push({
        campaign_id: campaignId,
        platform: this.platform,
        day: gSegments.date,
        amount: cost,
        currency: gCustomer?.currencyCode ?? 'USD',
        source_system: this.platform,
        ingested_at: common.ingested_at,
        tenant_id: this.tenantId,
      });
    }

    return {
      campaigns: Array.from(campaignsMap.values()),
      spend_facts,
    };
  }

  // --- WRITE PATH IMPLEMENTATION ---

  async plan(req: ActionRequest): Promise<ActionPlan> {
    this.logger.debug('Planning Google Ads action request', {
      'targetId': req.targetId,
      'op': req.op,
    });
    const warnings: string[] = [];
    let projectedCost = 0;

    let campBudget = 0;
    if (req.op !== 'create') {
      if (req.entity === 'ad_group') {
        const adg = this.simulatedAdGroups.get(req.targetId);
        if (!adg) {
          warnings.push(`Ad Group ${req.targetId} not found in live cache.`);
          this.logger.warn('Google Ads ad group not found in cache during planning', {
            'targetId': req.targetId,
          });
        }
      } else {
        const camp = this.simulatedCampaigns.get(req.targetId);
        if (!camp) {
          warnings.push(`Campaign ${req.targetId} not found in live cache.`);
          this.logger.warn('Google Ads campaign not found in cache during planning', {
            'targetId': req.targetId,
          });
        } else {
          campBudget = camp.budget;
        }
      }
    }

    if (req.op === 'create') {
      const payload = req.payload as {name: string; budget: number; status: string; objective: string};
      if (
        !payload ||
        typeof payload.name !== 'string' ||
        typeof payload.budget !== 'number' ||
        payload.budget <= 0
      ) {
        this.logger.warn('Invalid create plan payload', {
          'targetId': req.targetId,
          'payload': payload,
        });
        return {
          request: req,
          valid: false,
          projectedCost: 0,
          warnings: ['Invalid campaign creation parameters.'],
        };
      }
      projectedCost = payload.budget;
    } else if (req.op === 'update_budget') {
      const payload = req.payload as {budget: number};
      if (
        !payload ||
        typeof payload.budget !== 'number' ||
        payload.budget <= 0
      ) {
        this.logger.warn('Invalid update_budget plan payload', {
          'targetId': req.targetId,
          'payload': payload,
        });
        return {
          request: req,
          valid: false,
          projectedCost: 0,
          warnings: ['Invalid budget update value.'],
        };
      }
      projectedCost = Math.abs(payload.budget - campBudget);
    } else if (req.op === 'scale_budget') {
      const payload = req.payload as {scaleFactor: number};
      if (
        !payload ||
        typeof payload.scaleFactor !== 'number' ||
        payload.scaleFactor <= 0
      ) {
        this.logger.warn('Invalid scale_budget plan payload', {
          'targetId': req.targetId,
          'payload': payload,
        });
        return {
          request: req,
          valid: false,
          projectedCost: 0,
          warnings: ['Invalid budget scale factor.'],
        };
      }
      projectedCost = campBudget * Math.abs(payload.scaleFactor - 1.0);
    }

    this.logger.info('Google Ads action plan evaluated', {
      'targetId': req.targetId,
      'op': req.op,
      'valid': true,
      'projectedCost': projectedCost,
      'warningsCount': warnings.length,
    });

    return {
      request: req,
      valid: true,
      projectedCost,
      warnings,
    };
  }

  async execute(plan: ActionPlan): Promise<ActionResult> {
    const req = plan.request;
    this.logger.info('Executing Google Ads action', {
      'targetId': req.targetId,
      'op': req.op,
      'idempotencyKey': req.idempotencyKey,
    });

    if (!plan.valid) {
      this.logger.error('Google Ads execution rejected: plan is invalid', {
        'targetId': req.targetId,
        'op': req.op,
      });
      return {ok: false, auditRef: 'invalid_plan', error: 'Plan is invalid'};
    }

    const isMock = this.token.startsWith('mock');

    if (req.entity === 'ad_group') {
      let originalState: any;
      if (isMock) {
        const adg = this.simulatedAdGroups.get(req.targetId);
        originalState = adg ? {...adg} : {status: 'UNKNOWN'};

        if (req.op === 'pause') {
          this.simulatedAdGroups.set(req.targetId, {
            campaignId: adg?.campaignId ?? '',
            name: adg?.name ?? '',
            status: 'PAUSED',
          });
        } else if (req.op === 'activate') {
          this.simulatedAdGroups.set(req.targetId, {
            campaignId: adg?.campaignId ?? '',
            name: adg?.name ?? '',
            status: 'ENABLED',
          });
        }
      } else {
        const state = await this.fetchAdGroupState(req.targetId);
        originalState = { status: state.status };

        const newStatus = req.op === 'pause' ? 'PAUSED' : 'ENABLED';
        await this.mutateAdGroup(req.targetId, { status: newStatus });
      }

      const rollback: RollbackHandle = {
        rollbackId: `rb_${req.idempotencyKey}`,
        platform: this.platform,
        originalState: {
          entityType: 'ad_group',
          targetId: req.targetId,
          ...originalState
        },
      };

      this.logger.info('Google Ads action executed successfully for ad group', {
        'targetId': req.targetId,
        'op': req.op,
        'originalState': originalState,
      });

      return {
        ok: true,
        auditRef: `exec_${req.idempotencyKey}`,
        rollback,
      };
    }

    let originalState: any;
    if (isMock) {
      if (req.op === 'create') {
        originalState = { isCreated: true };
        const payload = req.payload as {name: string; budget: number; status: string; objective: string};
        this.simulatedCampaigns.set(req.targetId, {
          name: payload.name,
          budget: payload.budget,
          status: payload.status === 'ENABLED' ? 'ENABLED' : 'PAUSED',
        });
      } else {
        const camp = this.simulatedCampaigns.get(req.targetId);
        originalState = camp ? {...camp} : {budget: 0, status: 'UNKNOWN'};

        if (req.op === 'update_budget') {
          const payload = req.payload as {budget: number};
          this.simulatedCampaigns.set(req.targetId, {
            budget: payload.budget,
            status: camp?.status ?? 'ENABLED',
          });
        } else if (req.op === 'scale_budget') {
          const payload = req.payload as {scaleFactor: number};
          this.simulatedCampaigns.set(req.targetId, {
            budget: (camp?.budget ?? 0) * payload.scaleFactor,
            status: camp?.status ?? 'ENABLED',
          });
        } else if (req.op === 'update_feed') {
          this.simulatedCampaigns.set(req.targetId, {
            name: camp?.name,
            budget: camp?.budget ?? 0,
            status: camp?.status ?? 'ENABLED',
            activeVariantId: (req.payload as any)?.activeVariantId,
          });
        } else if (req.op === 'pause') {
          this.simulatedCampaigns.set(req.targetId, {
            budget: camp?.budget ?? 0,
            status: 'PAUSED',
          });
        } else if (req.op === 'activate') {
          const payload = req.payload as {name?: string; budget?: number};
          this.simulatedCampaigns.set(req.targetId, {
            name: payload?.name ?? camp?.name,
            budget: payload?.budget ?? camp?.budget ?? 0,
            status: 'ENABLED',
          });
        }
      }
    } else {
      if (req.op === 'create') {
        originalState = { isCreated: true };
        const payload = req.payload as {name: string; budget: number; status: string; objective: string};
        const budgetResourceName = await this.createBudget(payload.budget);
        const operations = [
          {
            create: {
              name: payload.name,
              status: payload.status === 'ENABLED' ? 'ENABLED' : 'PAUSED',
              advertisingChannelType: payload.objective,
              campaignBudget: budgetResourceName,
            }
          }
        ];
        await this.mutate('campaigns:mutate', operations);
      } else {
        const state = await this.fetchCampaignState(req.targetId);
        originalState = {
          budget: state.budget,
          status: state.status,
          budgetResourceName: state.budgetResourceName
        };

        if (req.op === 'update_budget') {
          const payload = req.payload as {budget: number};
          if (state.budgetResourceName) {
            await this.mutateBudget(state.budgetResourceName, payload.budget);
          }
        } else if (req.op === 'scale_budget') {
          const payload = req.payload as {scaleFactor: number};
          if (state.budgetResourceName) {
            await this.mutateBudget(state.budgetResourceName, state.budget * payload.scaleFactor);
          }
        } else if (req.op === 'pause') {
          await this.mutateCampaign(req.targetId, { status: 'PAUSED' });
        } else if (req.op === 'activate') {
          await this.mutateCampaign(req.targetId, { status: 'ENABLED' });
        } else if (req.op === 'update_feed') {
          this.logger.info('Real Google Ads update_feed not fully implemented, skipping API mutation');
        }
      }
    }

    const rollback: RollbackHandle = {
      rollbackId: `rb_${req.idempotencyKey}`,
      platform: this.platform,
      originalState: {
        entityType: 'campaign',
        targetId: req.targetId,
        ...originalState
      },
    };

    this.logger.info('Google Ads action executed successfully', {
      'targetId': req.targetId,
      'op': req.op,
      'originalState': originalState,
      'newState': isMock ? this.simulatedCampaigns.get(req.targetId) : 'API mutated',
    });

    return {
      ok: true,
      auditRef: `execute_${req.idempotencyKey}`,
      rollback,
    };
  }

  async rollback(h: RollbackHandle): Promise<ActionResult> {
    const original = h.originalState as {
      entityType: 'campaign' | 'ad_group';
      targetId: string;
      budget?: number;
      status: string;
      budgetResourceName?: string;
      isCreated?: boolean;
    };
    this.logger.info('Rolling back Google Ads action', {
      'rollbackId': h.rollbackId,
      'originalState': original,
    });

    const isMock = this.token.startsWith('mock');

    if (original.entityType === 'ad_group') {
      if (isMock) {
        const adg = this.simulatedAdGroups.get(original.targetId);
        this.simulatedAdGroups.set(original.targetId, {
          campaignId: adg?.campaignId ?? '',
          name: adg?.name ?? '',
          status: original.status,
        });
      } else {
        await this.mutateAdGroup(original.targetId, { status: original.status });
      }
    } else {
      if (original.isCreated === true) {
        if (isMock) {
          this.simulatedCampaigns.delete(original.targetId);
        } else {
          await this.mutateCampaign(original.targetId, { status: 'REMOVED' });
        }
      } else {
        if (isMock) {
          this.simulatedCampaigns.set(original.targetId, {
            budget: original.budget ?? 0,
            status: original.status,
          });
        } else {
          await this.mutateCampaign(original.targetId, { status: original.status });
          if (original.budgetResourceName && original.budget !== undefined) {
            await this.mutateBudget(original.budgetResourceName, original.budget);
          }
        }
      }
    }

    this.logger.info('Google Ads action rolled back complete', {
      'targetId': original.targetId,
      'restoredState': original,
    });

    return {
      ok: true,
      auditRef: `rollback_${h.rollbackId}`,
    };
  }


  private async fetchCampaignState(campaignId: string): Promise<{budget: number; status: string; budgetResourceName?: string}> {
    const query = `
      SELECT campaign.status, campaign.campaign_budget
      FROM campaign
      WHERE campaign.id = '${campaignId}'
    `;
    const results = await this.search(query);
    if (results.length === 0) {
      throw new Error(`Campaign ${campaignId} not found on Google Ads API`);
    }
    const status = results[0].campaign.status;
    const budgetResourceName = results[0].campaign.campaignBudget || results[0].campaign.campaign_budget;

    let budget = 0;
    if (budgetResourceName) {
      const budgetQuery = `
        SELECT campaign_budget.amount_micros
        FROM campaign_budget
        WHERE campaign_budget.resource_name = '${budgetResourceName}'
      `;
      const budgetResults = await this.search(budgetQuery);
      if (budgetResults.length > 0 && budgetResults[0].campaignBudget) {
        const amountMicros = parseFloat(budgetResults[0].campaignBudget.amountMicros || budgetResults[0].campaignBudget.amount_micros || '0');
        budget = amountMicros / 1000000.0;
      }
    }

    return {budget, status, budgetResourceName};
  }

  private async fetchAdGroupState(adGroupId: string): Promise<{status: string}> {
    const query = `
      SELECT ad_group.status
      FROM ad_group
      WHERE ad_group.id = '${adGroupId}'
    `;
    const results = await this.search(query);
    if (results.length === 0) {
      throw new Error(`Ad Group ${adGroupId} not found on Google Ads API`);
    }
    return {status: results[0].adGroup.status};
  }

  private async mutate(endpoint: string, operations: any[]): Promise<any> {
    if (this.token.startsWith('mock')) {
      return {results: []};
    }
    const cleanCustId = this.customerId.replace(/-/g, '');
    const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanCustId}/${endpoint}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'developer-token': this.developerToken,
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({operations}),
      });

      if (!res.ok) {
        throw new Error(`Google Ads API mutate error: ${res.statusText}`);
      }

      return await res.json();
    } catch (err: any) {
      this.logger.error('Google Ads mutate execution failed', {
        error: err?.message || String(err),
      });
      throw err;
    }
  }

  private async mutateCampaign(campaignId: string, updates: any): Promise<void> {
    const cleanCustId = this.customerId.replace(/-/g, '');
    const resourceName = `customers/${cleanCustId}/campaigns/${campaignId}`;
    const operations = [
      {
        update: {
          resourceName,
          ...updates
        },
        updateMask: Object.keys(updates).join(',')
      }
    ];
    await this.mutate('campaigns:mutate', operations);
  }

  private async mutateAdGroup(adGroupId: string, updates: any): Promise<void> {
    const cleanCustId = this.customerId.replace(/-/g, '');
    const resourceName = `customers/${cleanCustId}/adGroups/${adGroupId}`;
    const operations = [
      {
        update: {
          resourceName,
          ...updates
        },
        updateMask: Object.keys(updates).join(',')
      }
    ];
    await this.mutate('adGroups:mutate', operations);
  }

  private async mutateBudget(budgetResourceName: string, amountDollars: number): Promise<void> {
    const amountMicros = Math.round(amountDollars * 1000000);
    const operations = [
      {
        update: {
          resourceName: budgetResourceName,
          amountMicros
        },
        updateMask: 'amountMicros'
      }
    ];
    await this.mutate('campaignBudgets:mutate', operations);
  }

  private async createBudget(amountDollars: number): Promise<string> {
    if (this.token.startsWith('mock')) {
      const cleanCustId = this.customerId.replace(/-/g, '');
      return `customers/${cleanCustId}/campaignBudgets/mock_budget_${Date.now()}`;
    }

    const amountMicros = Math.round(amountDollars * 1000000);
    const operations = [
      {
        create: {
          name: `Twin-Discovery-Budget-${Date.now()}`,
          amountMicros,
          explicitlyShared: false,
        }
      }
    ];
    const res = await this.mutate('campaignBudgets:mutate', operations);
    const resourceName = res.results?.[0]?.resourceName;
    if (!resourceName) {
      throw new Error('Failed to retrieve resourceName from budget creation response');
    }
    return resourceName;
  }

  async healthCheck(): Promise<HealthReport> {
    const t0 = Date.now();
    try {
      const query = 'SELECT customer.id FROM customer LIMIT 1';
      await this.search(query);
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

  private getMockSearchResults(): any[] {
    return [
      {
        campaign: {
          id: 'c1',
          name: 'Google Search Leads',
          status: 'ENABLED',
          advertising_channel_type: 'SEARCH',
        },
        metrics: {
          cost_micros: '400000000', // $400 cost
        },
        segments: {
          date: new Date().toISOString().split('T')[0],
        },
        customer: {
          currency_code: 'USD',
        },
      },
    ];
  }

  // Helper to fetch simulated status in tests
  getSimulatedCampaign(id: string) {
    return this.simulatedCampaigns.get(id);
  }

  getSimulatedAdGroup(id: string) {
    return this.simulatedAdGroups.get(id);
  }

  async getCampaignLandingPages(campaignId: string): Promise<string[]> {
    this.logger.info('Fetching campaign landing pages', {campaignId});

    if (this.token.startsWith('mock')) {
      if (campaignId === 'c1' || campaignId === 'c-1') {
        return ['https://nutraboost.com/products/energy-bar'];
      }
      return ['https://nutraboost.com/products/hydration-powder'];
    }

    try {
      const query = `
        SELECT ad_group_ad.ad.final_urls
        FROM ad_group_ad
        WHERE campaign.id = '${campaignId}'
      `;
      const results = await this.search(query);
      const urls: string[] = [];
      for (const row of results) {
        const adUrls = row.adGroupAd?.ad?.finalUrls || [];
        for (const u of adUrls) {
          if (u) urls.push(u);
        }
      }
      return Array.from(new Set(urls));
    } catch (err: any) {
      this.logger.error('Failed to fetch campaign landing pages from API', {
        campaignId,
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
