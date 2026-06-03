export interface InventoryStatus {
  variantId: string;
  stockCount: number;
  salesLast7Days: number;
}

export class SpendForecaster {
  /**
   * Forecasts the next 24-hour spend based on current spend speed (hourly gradients).
   */
  forecast24hSpend(
    currentDailySpend: number,
    hourlyGradients: number[],
  ): number {
    if (hourlyGradients.length === 0) return currentDailySpend;
    const avgGradient =
      hourlyGradients.reduce((a, b) => a + b, 0) / hourlyGradients.length;
    // Projected spend is base current daily spend plus pacing acceleration
    return Math.max(0, currentDailySpend + avgGradient * 24);
  }
}

export class StockoutPredictor {
  /**
   * Returns estimated hours until stockout.
   */
  hoursToStockout(item: InventoryStatus): number {
    const dailySalesVelocity = item.salesLast7Days / 7;
    if (dailySalesVelocity <= 0) {
      return Infinity; // No sales velocity, infinite stock
    }
    const daysLeft = item.stockCount / dailySalesVelocity;
    return daysLeft * 24;
  }
}
