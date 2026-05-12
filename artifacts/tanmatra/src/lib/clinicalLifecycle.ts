import type { PastOrder } from "./ordersContext";

export type ClinicalStage =
  | "submitted"
  | "verified"
  | "preparing"
  | "out_for_delivery"
  | "received";

export interface ClinicalStageMeta {
  key: ClinicalStage;
  label: string;
  shortLabel: string;
}

export const CLINICAL_STAGES: ClinicalStageMeta[] = [
  { key: "submitted", label: "Submitted", shortLabel: "Submitted" },
  { key: "verified", label: "Verified by Nutritionist", shortLabel: "Verified" },
  { key: "preparing", label: "In Preparation", shortLabel: "Preparing" },
  { key: "out_for_delivery", label: "Out for Delivery", shortLabel: "En route" },
  { key: "received", label: "Patient Received", shortLabel: "Received" },
];

export function statusToClinicalStage(
  status: PastOrder["status"],
  hasVerification: boolean,
): ClinicalStage {
  switch (status) {
    case "placed":
      return hasVerification ? "verified" : "submitted";
    case "preparing":
    case "ready":
      return "preparing";
    case "out_for_delivery":
      return "out_for_delivery";
    case "delivered":
      return "received";
    case "cancelled":
      return "submitted";
    default:
      return "submitted";
  }
}

export function clinicalStageIndex(stage: ClinicalStage): number {
  return CLINICAL_STAGES.findIndex((s) => s.key === stage);
}

export function isCancellable(status: PastOrder["status"]): boolean {
  return status !== "delivered" && status !== "cancelled";
}

export const CANCEL_REASONS = [
  { value: "npo", label: "NPO ordered (nil per os)" },
  { value: "patient_transferred", label: "Patient transferred" },
  { value: "clinical_status_change", label: "Clinical status change" },
  { value: "other", label: "Other" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];
