export { generateClientSummary } from "./clientSummary";
export type { ClientSummaryInput, ClientSummaryResult } from "./clientSummary";
export { draftPlanForReview } from "./planDrafter";
export type { PlanDraftInput, PlanDraftResult } from "./planDrafter";
export {
  detectAdherenceForPlan,
  computeDrift,
  buildNudgeText,
  shouldEscalateToRd,
  OVER_CALORIES_RATIO,
  MISSED_PROTEIN_RATIO,
} from "./adherence";
export type { AdherenceScanResult } from "./adherence";
export { rewriteNudge } from "./nudgeWriter";
export type { RewriteNudgeInput, RewriteNudgeResult } from "./nudgeWriter";
