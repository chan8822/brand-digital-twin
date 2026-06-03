/**
 * @fileoverview Marketing attribution engine supporting fractional credit formulas.
 */

export interface Touchpoint {
  platform: string; // e.g. 'google', 'meta', 'tiktok'
  timestamp: number;
  campaignId: string;
}

export interface ChannelCredit {
  platform: string;
  allocatedValue: number;
}

export class AttributionEngine {
  /**
   * Distributes conversion value equally across all touchpoints (Linear).
   */
  calculateLinearAttribution(touchpoints: Touchpoint[], conversionValue: number): ChannelCredit[] {
    if (touchpoints.length === 0) return [];
    const equalShare = conversionValue / touchpoints.length;

    const aggregate: Record<string, number> = {};
    for (const tp of touchpoints) {
      aggregate[tp.platform] = (aggregate[tp.platform] || 0) + equalShare;
    }

    return Object.entries(aggregate).map(([platform, value]) => ({
      platform,
      allocatedValue: Math.round(value * 100) / 100,
    }));
  }

  /**
   * Assigns higher value to touchpoints closer to the purchase time (Time-Decay).
   */
  calculateTimeDecayAttribution(
    touchpoints: Touchpoint[],
    conversionValue: number,
    purchaseTimestamp: number,
    halfLifeDays: number = 7
  ): ChannelCredit[] {
    if (touchpoints.length === 0) return [];

    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    let totalWeight = 0;
    const weights = touchpoints.map(tp => {
      const diffMs = Math.max(0, purchaseTimestamp - tp.timestamp);
      // Exponential decay: weight = 2^(-t / halfLife)
      const weight = Math.pow(2, -diffMs / halfLifeMs);
      totalWeight += weight;
      return { tp, weight };
    });

    if (totalWeight === 0) return this.calculateLinearAttribution(touchpoints, conversionValue);

    const aggregate: Record<string, number> = {};
    for (const entry of weights) {
      const share = conversionValue * (entry.weight / totalWeight);
      aggregate[entry.tp.platform] = (aggregate[entry.tp.platform] || 0) + share;
    }

    return Object.entries(aggregate).map(([platform, value]) => ({
      platform,
      allocatedValue: Math.round(value * 100) / 100,
    }));
  }

  /**
   * Allocates 40% to first, 40% to last, and 20% divided among middle (Position-Based / U-Shape).
   */
  calculatePositionBasedAttribution(touchpoints: Touchpoint[], conversionValue: number): ChannelCredit[] {
    if (touchpoints.length === 0) return [];
    if (touchpoints.length === 1) {
      return [{ platform: touchpoints[0].platform, allocatedValue: conversionValue }];
    }
    if (touchpoints.length === 2) {
      // 50% first, 50% last
      const share = conversionValue / 2;
      const aggregate: Record<string, number> = {};
      aggregate[touchpoints[0].platform] = (aggregate[touchpoints[0].platform] || 0) + share;
      aggregate[touchpoints[1].platform] = (aggregate[touchpoints[1].platform] || 0) + share;
      return Object.entries(aggregate).map(([platform, value]) => ({
        platform,
        allocatedValue: Math.round(value * 100) / 100,
      }));
    }

    const firstShare = conversionValue * 0.4;
    const lastShare = conversionValue * 0.4;
    const middleTotalShare = conversionValue * 0.2;
    const middleCount = touchpoints.length - 2;
    const middleShare = middleTotalShare / middleCount;

    const aggregate: Record<string, number> = {};

    // First touch
    const firstPlatform = touchpoints[0].platform;
    aggregate[firstPlatform] = (aggregate[firstPlatform] || 0) + firstShare;

    // Middle touches
    for (let i = 1; i < touchpoints.length - 1; i++) {
      const platform = touchpoints[i].platform;
      aggregate[platform] = (aggregate[platform] || 0) + middleShare;
    }

    // Last touch
    const lastPlatform = touchpoints[touchpoints.length - 1].platform;
    aggregate[lastPlatform] = (aggregate[lastPlatform] || 0) + lastShare;

    return Object.entries(aggregate).map(([platform, value]) => ({
      platform,
      allocatedValue: Math.round(value * 100) / 100,
    }));
  }
}
