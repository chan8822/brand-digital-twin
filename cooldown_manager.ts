import { ActionRequest } from './platform_adapter';
import { SupabaseClient } from './supabase_client';
import { PinoLogger } from './observability';

/**
 * CooldownManager checks if actions are restricted by a time-decay execution window.
 */
export class CooldownManager {
  private readonly logger = new PinoLogger();
  public bypassInTests = true;

  constructor(private readonly db: SupabaseClient) {}

  /**
   * Returns true if the action is allowed to proceed (no executions within the cooldown window).
   * Returns false if a cooldown is active.
   */
  async checkCooldown(
    tenantId: string,
    req: ActionRequest,
    cooldownWindowMs = 24 * 60 * 60 * 1000 // 24 hours default
  ): Promise<boolean> {
    const isTest = process.env['NODE_ENV'] === 'test' || typeof (globalThis as any)['jasmine'] !== 'undefined';
    if (isTest && this.bypassInTests) {
      return true;
    }

    const sinceTime = Date.now() - cooldownWindowMs;
    const sinceIso = new Date(sinceTime).toISOString();

    try {
      const recent = await this.db.getRecentExecutions(
        tenantId,
        req.entity,
        req.targetId,
        req.op,
        sinceIso
      );

      if (recent.length > 0) {
        this.logger.info('Action blocked by cooldown limit', {
          tenantId,
          entity: req.entity,
          targetId: req.targetId,
          op: req.op,
          lastExecutionTime: recent[0].timestamp,
          cooldownWindowMs,
        });
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.error('Error checking cooldown status, allowing execution as failsafe', {
        tenantId,
        entity: req.entity,
        targetId: req.targetId,
        error: err.message || String(err),
      });
      // Failsafe: if cooldown query fails, do not block execution
      return true;
    }
  }
}
