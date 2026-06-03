/**
 * @fileoverview Account Health Monitor and Unified Dashboard Engine.
 */

import {InventoryStatus} from './forecasting';
import {SupabaseClient} from './supabase_client';
import {UnifiedIntelligenceBrain} from './unified_brain';

export interface AccountHealthDashboard {
  clientId: string;
  overallScore: number;
  dimensionalScores: {
    brand: number;
    financial: number;
    team: number;
    client: number;
    operational: number;
    performance: number;
  };
  anomalies: string[];
  predictiveAlerts: string[];
}

export class AccountHealthMonitor {
  private readonly brain: UnifiedIntelligenceBrain;

  constructor(private readonly db: SupabaseClient) {
    this.brain = new UnifiedIntelligenceBrain(db);
  }

  /**
   * Calculates overall client health and populates all operational dimensions.
   */
  async computeDashboard(
    tenantId: string,
    clientId: string,
    inventory: InventoryStatus[],
    currentDailySpend: number,
    hourlyGradients: number[],
    metricHistory: Record<string, number[]>,
  ): Promise<AccountHealthDashboard | null> {
    const clients = await this.db.getClients(tenantId);
    const client = clients.find((c) => c.clientId === clientId);
    if (!client) return null;

    // 1. Brand Health score
    const brandStatus = await this.brain.analyzeBrandHealth(tenantId);
    const brandScore = brandStatus.sentimentScore;

    // 2. Financial score
    const forecast = await this.brain.generateForecasts(
      tenantId,
      currentDailySpend,
      hourlyGradients,
    );
    const financialScore = Math.max(
      0,
      Math.min(100, Math.round(forecast.conservativeMarginPct * 100 * 2)),
    ); // normalized

    // 3. Team workload score
    const capacityStatus = await this.brain.analyzeTeamCapacity(tenantId);
    const teamScore = Math.max(
      0,
      100 - Math.round(capacityStatus.avgCapacityPct),
    );

    // 4. Client profile score
    const clientScore = client.healthScore;

    // 5. Operational score (penalized by inventory risks)
    const operationalRisks = await this.brain.detectRisks(tenantId, inventory);
    const operationalScore = Math.max(0, 100 - operationalRisks.length * 15);

    // 6. Performance score (base client success or ROIs)
    const performanceScore = Math.max(
      0,
      Math.min(100, Math.round(client.healthScore * 1.1)),
    );

    // Calculate overall health score as simple average of dimensions
    const overallScore = Math.round(
      (brandScore +
        financialScore +
        teamScore +
        clientScore +
        operationalScore +
        performanceScore) /
        6,
    );

    // Anomaly detection
    const anomalies = this.detectMetricAnomalies(metricHistory);

    // 7-day predictive alerts
    const predictiveAlerts: string[] = [];
    if (forecast.runwayMonths < 3) {
      predictiveAlerts.push(
        `7-Day Warning: Cash runway is critically short at ${forecast.runwayMonths} months.`,
      );
    }
    if (client.churnRisk > 0.6) {
      predictiveAlerts.push(
        `7-Day Warning: High churn risk detected for client ${client.name}. Probability: ${client.churnRisk}`,
      );
    }
    if (capacityStatus.avgCapacityPct > 80) {
      predictiveAlerts.push(
        `7-Day Warning: Extreme team capacity overload predicted (avg utilization at ${Math.round(capacityStatus.avgCapacityPct)}%).`,
      );
    }
    if (forecast.conservativeMarginPct < client.marginTarget) {
      predictiveAlerts.push(
        `7-Day Warning: Conservative margin forecast ($${Math.round(forecast.conservativeMarginPct * 100)}%) is pacing below margin target ($${Math.round(client.marginTarget * 100)}%).`,
      );
    }

    // Include operational risks into predictive alerts
    for (const risk of operationalRisks) {
      predictiveAlerts.push(`Operational Alert: ${risk}`);
    }

    return {
      clientId,
      overallScore,
      dimensionalScores: {
        brand: brandScore,
        financial: financialScore,
        team: teamScore,
        client: clientScore,
        operational: operationalScore,
        performance: performanceScore,
      },
      anomalies,
      predictiveAlerts,
    };
  }

  /**
   * Scans historic metrics to detect sudden shifts exceeding the 20% limit.
   */
  private detectMetricAnomalies(history: Record<string, number[]>): string[] {
    const anomalies: string[] = [];

    for (const [metricName, values] of Object.entries(history)) {
      if (values.length < 2) continue;
      const last = values[values.length - 1];
      const prev = values[values.length - 2];
      if (prev === 0) continue;

      const pctShift = Math.abs((last - prev) / prev);
      if (pctShift > 0.2) {
        anomalies.push(
          `Anomaly detected: metric '${metricName}' shifted by ${Math.round(pctShift * 100)}% (from ${prev} to ${last})`,
        );
      }
    }

    return anomalies;
  }
}
