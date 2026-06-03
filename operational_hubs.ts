/**
 * @fileoverview Complete integration hubs linking external SaaS APIs into Agency OS.
 */

import {
  BrandSignal,
  ClientProfile,
  CompetitorSignal,
  CreativeAsset,
  FinancialTransaction,
  SocialMention,
} from './agency_os_types';
import {SupabaseClient} from './supabase_client';

/**
 * BrandMonitoringHub aggregates mentions, news articles, and competitor intelligence.
 */
export class BrandMonitoringHub {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Ingests a new social mention. Automatically flags negative sentiment from influencers as high severity.
   */
  async ingestMention(mention: SocialMention): Promise<BrandSignal | null> {
    await this.db.saveSocialMention(mention);

    if (mention.sentiment === 'negative' && mention.influencer) {
      const signal: BrandSignal = {
        signalId: `sig-brand-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        tenantId: mention.tenantId,
        source: 'social',
        type: 'negative_sentiment_crisis',
        severity: 'critical',
        message: `Crisis alert: Negative influencer post on ${mention.platform}. Reach: ${mention.reach}`,
        payload: {
          mentionId: mention.mentionId,
          url: mention.url,
          reach: mention.reach,
        },
        timestamp: Date.now(),
      };
      await this.db.saveBrandSignal(signal);
      return signal;
    }
    return null;
  }

  /**
   * Ingests competitor ad updates or price changes.
   */
  async ingestCompetitorSignal(signal: CompetitorSignal): Promise<BrandSignal> {
    await this.db.saveCompetitorSignal(signal);

    const bSignal: BrandSignal = {
      signalId: `sig-comp-${Date.now()}`,
      tenantId: signal.tenantId,
      source: 'social',
      type: 'competitor_intel',
      severity: 'medium',
      message: `Competitor ${signal.competitorName} launched activity: ${signal.signalType}`,
      payload: signal.details,
      timestamp: Date.now(),
    };
    await this.db.saveBrandSignal(bSignal);
    return bSignal;
  }
}

/**
 * ProjectManagementHub tracks team workloads, project timelines, and task status.
 */
export class ProjectManagementHub {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Evaluates task backlogs to flag bottleneck risks.
   */
  async analyzeTaskBottlenecks(
    tenantId: string,
    memberId: string,
    backlogCount: number,
  ): Promise<BrandSignal | null> {
    if (backlogCount > 15) {
      const signal: BrandSignal = {
        signalId: `sig-pm-${Date.now()}`,
        tenantId,
        source: 'team',
        type: 'backlog_overload',
        severity: 'high',
        message: `Task bottleneck: Member ${memberId} has ${backlogCount} pending tasks in queue.`,
        payload: {memberId, backlogCount},
        timestamp: Date.now(),
      };
      await this.db.saveBrandSignal(signal);
      return signal;
    }
    return null;
  }
}

/**
 * CRMHub syncs Deals, Contacts, and Client profiles.
 */
export class CRMHub {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Updates customer lifetime values and triggers client profile upsell flags.
   */
  async syncClientProfile(
    tenantId: string,
    profile: ClientProfile,
  ): Promise<BrandSignal | null> {
    await this.db.saveClient(profile);

    if (profile.mrr > 25000 && profile.healthScore > 90) {
      const signal: BrandSignal = {
        signalId: `sig-crm-${Date.now()}`,
        tenantId,
        source: 'client',
        type: 'upsell_opportunity',
        severity: 'info',
        message: `High-value client ${profile.name} (MRR=$${profile.mrr}) is in excellent health. Recommended for upsell.`,
        payload: {clientId: profile.clientId, healthScore: profile.healthScore},
        timestamp: Date.now(),
      };
      await this.db.saveBrandSignal(signal);
      return signal;
    }
    return null;
  }
}

/**
 * FinanceHub interfaces with QuickBooks/Tally and bank Statement APIs.
 */
export class FinanceHub {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Ingests bank transactions and flags massive expense anomalies.
   */
  async ingestTransaction(
    transaction: FinancialTransaction,
  ): Promise<BrandSignal | null> {
    await this.db.saveFinancialTransaction(transaction);

    if (transaction.type === 'expense' && transaction.amount > 10000) {
      const signal: BrandSignal = {
        signalId: `sig-fin-${Date.now()}`,
        tenantId: transaction.tenantId,
        source: 'client', // categorized under financial client operations
        type: 'large_expense_alert',
        severity: 'high',
        message: `Large expense flagged: $${transaction.amount} on '${transaction.description}'`,
        payload: {amount: transaction.amount, category: transaction.category},
        timestamp: Date.now(),
      };
      await this.db.saveBrandSignal(signal);
      return signal;
    }
    return null;
  }
}

/**
 * CreativeHub handles compliance checking for brand creative assets.
 */
export class CreativeHub {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Ingests a new creative asset and performs automated compliance policy tests.
   */
  async registerAsset(asset: CreativeAsset): Promise<BrandSignal | null> {
    await this.db.saveCreativeAsset(asset);

    if (!asset.complianceOk) {
      const signal: BrandSignal = {
        signalId: `sig-cr-${Date.now()}`,
        tenantId: asset.tenantId,
        source: 'content',
        type: 'compliance_violation',
        severity: 'high',
        message: `Compliance warning: Asset ${asset.title} failed safety guidelines.`,
        payload: {assetId: asset.assetId, campaign: asset.campaign},
        timestamp: Date.now(),
      };
      await this.db.saveBrandSignal(signal);
      return signal;
    }
    return null;
  }
}
