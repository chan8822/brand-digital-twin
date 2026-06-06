import {AuditSink} from './governance_types';
import {redactSensitiveData} from './observability';
import {SupabaseClient} from './supabase_client';

/**
 * Implementation of AuditSink that records compliance events to Supabase DB.
 */
export class PersistentAuditSink implements AuditSink {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Securely logs an activity or decision to the database.
   */
  async record(row: Record<string, unknown>): Promise<void> {
    const redactedRow = redactSensitiveData(row);
    await this.db.saveGovernanceEvent({
      action_id: String(redactedRow['action_id'] || ''),
      tenant_id: String(redactedRow['tenant_id'] || ''),
      actor: String(redactedRow['actor'] || 'system'),
      action_type: String(redactedRow['action_type'] || ''),
      target_entity: String(redactedRow['target_entity'] || ''),
      status: String(redactedRow['status'] || ''),
      reason: String(redactedRow['reason'] || ''),
      created_at: String(redactedRow['created_at'] || new Date().toISOString()),
    });
  }
}
