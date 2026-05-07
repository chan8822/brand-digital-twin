interface ModelPrice {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

const PRICING: Record<string, ModelPrice> = {
  "gemini-2.5-flash": { inputUsdPerMillion: 0.075, outputUsdPerMillion: 0.3 },
  "gemini-2.5-pro": { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
  "gemini-2.5-flash-lite": {
    inputUsdPerMillion: 0.0375,
    outputUsdPerMillion: 0.15,
  },
};

export function estimateCostMicroUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING[modelId] ?? PRICING["gemini-2.5-flash"]!;
  const usd =
    (inputTokens * price.inputUsdPerMillion) / 1_000_000 +
    (outputTokens * price.outputUsdPerMillion) / 1_000_000;
  return Math.round(usd * 1_000_000);
}
