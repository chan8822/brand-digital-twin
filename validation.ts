/**
 * @fileoverview Native lightweight validation helper functions.
 */

import { ActionRequest } from "./platform_adapter";
import { Context } from "./governance_types";
import { ValidationError } from "./errors";

/**
 * Validates the ActionRequest payload fields and returns the typed object.
 */
export function validateActionRequest(req: any): ActionRequest {
  if (!req) {
    throw new ValidationError("Missing actionRequest in payload");
  }

  if (typeof req.idempotencyKey !== "string" || !req.idempotencyKey.trim()) {
    throw new ValidationError("Invalid or missing idempotencyKey: must be a non-empty string");
  }

  const allowedOps = ["pause", "activate", "scale_budget", "update_budget", "update_feed"];
  if (typeof req.op !== "string" || !allowedOps.includes(req.op)) {
    throw new ValidationError(`Invalid or missing op: must be one of: ${allowedOps.join(", ")}`);
  }

  const allowedEntities = ["campaign", "spend_fact"];
  if (typeof req.entity !== "string" || !allowedEntities.includes(req.entity)) {
    throw new ValidationError(`Invalid or missing entity: must be one of: ${allowedEntities.join(", ")}`);
  }

  if (typeof req.targetId !== "string" || !req.targetId.trim()) {
    throw new ValidationError("Invalid or missing targetId: must be a non-empty string");
  }

  if (req.payload && typeof req.payload !== "object") {
    throw new ValidationError("Invalid payload: must be an object");
  }

  if (req.confidence !== undefined) {
    if (typeof req.confidence !== "number" || req.confidence < 0 || req.confidence > 1) {
      throw new ValidationError("Invalid confidence: must be a number between 0.0 and 1.0");
    }
  }

  return req as ActionRequest;
}

/**
 * Validates the Context payload fields and returns the typed object.
 */
export function validateContext(ctx: any): Context {
  if (!ctx) {
    throw new ValidationError("Missing context in payload");
  }

  // Tenant validation
  if (!ctx.tenant) {
    throw new ValidationError("Missing tenant in context");
  }
  if (typeof ctx.tenant.tenantId !== "string" || !ctx.tenant.tenantId.trim()) {
    throw new ValidationError("Invalid or missing tenantId: must be a non-empty string");
  }

  // Tenant policy validation
  if (!ctx.tenant.policy) {
    throw new ValidationError("Missing tenant policy in context");
  }
  const policy = ctx.tenant.policy;
  if (typeof policy.maxDailyDollarsRisk !== "number" || policy.maxDailyDollarsRisk < 0) {
    throw new ValidationError("Invalid or missing maxDailyDollarsRisk: must be a non-negative number");
  }
  if (policy.minConfidence !== undefined) {
    if (typeof policy.minConfidence !== "number" || policy.minConfidence < 0 || policy.minConfidence > 1) {
      throw new ValidationError("Invalid minConfidence: must be a number between 0.0 and 1.0");
    }
  }
  if (typeof policy.escalationRole !== "string" || !policy.escalationRole.trim()) {
    throw new ValidationError("Invalid or missing escalationRole: must be a non-empty string");
  }

  // Role validation
  if (!ctx.role) {
    throw new ValidationError("Missing role in context");
  }
  if (typeof ctx.role.name !== "string" || !ctx.role.name.trim()) {
    throw new ValidationError("Invalid or missing role name: must be a non-empty string");
  }

  return ctx as Context;
}
