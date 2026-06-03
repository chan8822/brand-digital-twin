/**
 * @fileoverview Central intelligence layer (UnifiedBrain) for the 360 Agency Operations OS.
 */

import {
  BrandSignal,
  ClientProfile,
  FinancialTransaction,
  TeamMember,
} from './agency_os_types';
import {
  InventoryStatus,
  SpendForecaster,
  StockoutPredictor,
} from './forecasting';
import {SupabaseClient} from './supabase_client';

export interface Recommendation {
  type: string; // 'pause_campaign' | 'scale_budget' | 'pr_response' | 'rebalance_workload' | 'client_outreach';
  targetId: string;
  reason: string;
  confidence: number;
}

export interface ScenarioRun {
  conservativeMarginPct: number;
  optimisticMarginPct: number;
  runwayMonths: number;
}

export class UnifiedIntelligenceBrain {
  private readonly forecaster = new SpendForecaster();
  private readonly stockoutPredictor = new StockoutPredictor();

  constructor(private readonly db: SupabaseClient) {}

  /**
   * Evaluates campaign profitability and generates adjustments if performance decreases below benchmarks.
   */
  async analyzeProfitability(tenantId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const signals = await this.db.getBrandSignals(tenantId);

    // Find unprofitable signals
    const unprofitableSignals = signals.filter(
      (s) =>
        s.type === 'low_performance_roi' || s.type === 'compliance_violation',
    );
    for (const signal of unprofitableSignals) {
      recommendations.push({
        type: 'pause_campaign',
        targetId: signal.payload['campaignId'] || 'unknown',
        reason: `Unprofitable performance alert: ${signal.message}`,
        confidence: 0.9,
      });
    }

    return recommendations;
  }

  /**
   * Evaluates brand sentiment and triggers automated PR tasks if negative spikes are detected.
   */
  async analyzeBrandHealth(
    tenantId: string,
  ): Promise<{
    sentimentScore: number;
    crisisActive: boolean;
    recommendations: Recommendation[];
  }> {
    const signals = await this.db.getBrandSignals(tenantId);
    const mentions = await this.db.getSocialMentions(tenantId);

    const negativeMentions = mentions.filter(
      (m) => m.sentiment === 'negative',
    ).length;
    const totalMentions = mentions.length || 1;
    const sentimentScore = Math.max(
      0,
      100 - Math.round((negativeMentions / totalMentions) * 100),
    );

    const crisisActive = signals.some(
      (s) =>
        s.type === 'negative_sentiment_crisis' && s.severity === 'critical',
    );
    const recommendations: Recommendation[] = [];

    if (crisisActive) {
      recommendations.push({
        type: 'pr_response',
        targetId: 'pr-team',
        reason:
          'Critical negative sentiment crisis active. Automated PR escalation response triggered.',
        confidence: 0.95,
      });
    }

    return {sentimentScore, crisisActive, recommendations};
  }

  /**
   * Scans inventory, workloads, and contract levels to detect structural operational risks.
   */
  async detectRisks(
    tenantId: string,
    inventoryStatuses: InventoryStatus[],
  ): Promise<string[]> {
    const risks: string[] = [];

    // 1. Stockout risk
    for (const item of inventoryStatuses) {
      const hoursLeft = this.stockoutPredictor.hoursToStockout(item);
      if (hoursLeft <= 48) {
        risks.push(
          `Inventory risk: SKU ${item.variantId} predicted stockout in ${Math.round(hoursLeft)} hours.`,
        );
      }
    }

    // 2. Workload capacity risk
    const signals = await this.db.getBrandSignals(tenantId);
    const overloadSignals = signals.filter(
      (s) => s.type === 'backlog_overload' || s.type === 'calendar_utilization',
    );
    for (const signal of overloadSignals) {
      risks.push(`Operational risk: ${signal.message}`);
    }

    return risks;
  }

  /**
   * Evaluates team member capacity levels and makes recommendations for rebalancing.
   */
  async analyzeTeamCapacity(
    tenantId: string,
  ): Promise<{avgCapacityPct: number; recommendations: Recommendation[]}> {
    const members = await this.db.getTeamMembers(tenantId);
    if (members.length === 0) return {avgCapacityPct: 0, recommendations: []};

    const totalPct = members.reduce((sum, m) => sum + m.capacityPct, 0);
    const avgCapacityPct = totalPct / members.length;

    const recommendations: Recommendation[] = [];
    const overloaded = members.filter((m) => m.capacityPct > 85);
    const underloaded = members.filter((m) => m.capacityPct < 40);

    if (overloaded.length > 0 && underloaded.length > 0) {
      recommendations.push({
        type: 'rebalance_workload',
        targetId: overloaded[0].memberId,
        reason: `Rebalance tasks from overloaded member ${overloaded[0].memberId} (${overloaded[0].capacityPct}%) to underloaded member ${underloaded[0].memberId} (${underloaded[0].capacityPct}%)`,
        confidence: 0.85,
      });
    }

    return {avgCapacityPct, recommendations};
  }

  /**
   * Computes client health probability and churn risk metrics.
   */
  async analyzeClientHealth(tenantId: string): Promise<ClientProfile[]> {
    const clients = await this.db.getClients(tenantId);
    for (const client of clients) {
      // Dynamically simulate client churn probability recalculation
      if (client.healthScore < 60) {
        client.churnRisk = Math.min(1.0, client.churnRisk + 0.15);
      }
    }
    return clients;
  }

  /**
   * Searches client parameters to discover upselling opportunities or margin expansions.
   */
  async discoverOpportunities(tenantId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const signals = await this.db.getBrandSignals(tenantId);
    const upsellOpportunities = signals.filter(
      (s) => s.type === 'upsell_opportunity',
    );

    for (const opp of upsellOpportunities) {
      recommendations.push({
        type: 'client_outreach',
        targetId: opp.payload['clientId'] || 'unknown',
        reason: `Upsell outreach suggested: ${opp.message}`,
        confidence: 0.8,
      });
    }

    return recommendations;
  }

  /**
   * Projects daily spend pacing and models Conservative/Optimistic runways.
   */
  async generateForecasts(
    tenantId: string,
    currentDailySpend: number,
    hourlyGradients: number[],
  ): Promise<ScenarioRun> {
    const predictedDaily = this.forecaster.forecast24hSpend(
      currentDailySpend,
      hourlyGradients,
    );
    const txns = await this.db.getFinancialTransactions(tenantId);

    const totalExpense = txns
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = txns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    // Approximate burn rate per month
    const monthlyBurn = Math.max(1000, totalExpense - totalIncome);
    const mockCashReserve = 250000;
    const runwayMonths = Math.round((mockCashReserve / monthlyBurn) * 10) / 10;

    // Simulate scenario modeling variations
    const variance = predictedDaily > currentDailySpend ? -0.05 : 0.03;
    const baseMargin = 0.35; // 35% default target

    return {
      conservativeMarginPct: baseMargin + variance - 0.02,
      optimisticMarginPct: baseMargin + variance + 0.05,
      runwayMonths,
    };
  }
}
