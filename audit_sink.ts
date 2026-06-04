import {AuditSink} from './governance_types';
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
    await this.db.saveGovernanceEvent({
      action_id: String(row['action_id'] || ''),
      tenant_id: String(row['tenant_id'] || ''),
      actor: String(row['actor'] || 'system'),
      action_type: String(row['action_type'] || ''),
      target_entity: String(row['target_entity'] || ''),
      status: String(row['status'] || ''),
      reason: String(row['reason'] || ''),
      created_at: String(row['created_at'] || new Date().toISOString()),
    });
  }
}
