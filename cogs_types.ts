export interface CogsCoverage {
  coveragePct: number;
  realPct: number;
  estimatedPct: number;
  missingCostSkus: string[];
  basis: 'ad_spend';
}

export interface CogsGap {
  sku: string;
  variantId: string;
  adSpend: number;
  price: number;
  title: string;
  estimated: boolean;
}
