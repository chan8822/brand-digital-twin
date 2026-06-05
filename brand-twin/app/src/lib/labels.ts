/**
 * Human-readable labels for engine enums (RootCause, Side). Keeps the UI copy
 * in one place so screens stay consistent.
 */
import type { RootCause, Side } from "./types";

export const ROOT_CAUSE_LABELS: Record<RootCause, string> = {
  LOW_CONVERSION: "Low conversion rate",
  CPC_TOO_HIGH: "Cost per click too high",
  SPEND_INEFFICIENT: "Inefficient spend",
  COGS_TOO_HIGH: "Cost of goods too high",
  DISCOUNT_OVERUSE: "Discount overuse",
  SHIPPING_TOO_HIGH: "Shipping cost too high",
  MARKETPLACE_FEES: "Marketplace fees",
  HIGH_REFUND_RATE: "High refund rate",
  INSUFFICIENT_DATA: "Not enough data yet",
};

export const SIDE_LABELS: Record<Side, string> = {
  ADVERTISING: "Advertising",
  ECONOMICS: "Economics",
  UNKNOWN: "Unknown",
};
