import {GovernanceEngine} from './governance_engine';
import {Context} from './governance_types';
import {
  ActionRequest,
  ActionResult,
  PlatformAdapter,
  RollbackHandle,
} from './platform_adapter';
import {PinoLogger} from './observability';

export interface BundleNode {
  id: string;
  adapter: PlatformAdapter;
  request: ActionRequest;
  dependsOn?: string[]; // IDs of other nodes in this bundle that must complete first
}

export interface ActionBundle {
  bundleId: string;
  nodes: BundleNode[];
}

export interface BundleResult {
  ok: boolean;
  executedNodeIds: string[];
  failedNodeId?: string;
  error?: string;
  rolledBack: boolean;
}

// --- Conflict Registry ---
export class ConflictRegistry {
  private activeLocks: Set<string> = new Set();

  acquireLock(entity: string, targetId: string): boolean {
    const key = `${entity}:${targetId}`;
    if (this.activeLocks.has(key)) {
      return false;
    }
    this.activeLocks.add(key);
    return true;
  }

  releaseLock(entity: string, targetId: string) {
    const key = `${entity}:${targetId}`;
    this.activeLocks.delete(key);
  }
}

// --- Orchestrator ---
export class Orchestrator {
  private conflictRegistry = new ConflictRegistry();
  private readonly logger = new PinoLogger(30, false);

  constructor(private governance: GovernanceEngine) {}

  getConflictRegistry(): ConflictRegistry {
    return this.conflictRegistry;
  }

  async governBundle(
    bundle: ActionBundle,
    ctx: Context,
  ): Promise<BundleResult> {
    const nodeStatus: Map<
      string,
      'pending' | 'success' | 'failed' | 'skipped'
    > = new Map();
    const rollbackStack: {
      nodeId: string;
      adapter: PlatformAdapter;
      handle: RollbackHandle;
    }[] = [];
    const executedNodeIds: string[] = [];

    await this.governance.supabase.beginTransaction();

    for (const node of bundle.nodes) {
      nodeStatus.set(node.id, 'pending');
    }

    let processedAny = true;
    let failedNodeId: string | undefined;
    let failureError: string | undefined;

    while (processedAny && !failedNodeId) {
      processedAny = false;

      for (const node of bundle.nodes) {
        if (nodeStatus.get(node.id) !== 'pending') {
          continue;
        }

        // Check if dependencies are met
        const deps = node.dependsOn ?? [];
        let depsMet = true;
        let depFailed = false;

        for (const depId of deps) {
          const status = nodeStatus.get(depId);
          if (status !== 'success') {
            depsMet = false;
          }
          if (status === 'failed' || status === 'skipped') {
            depFailed = true;
          }
        }

        if (depFailed) {
          nodeStatus.set(node.id, 'skipped');
          processedAny = true;
          continue;
        }

        if (!depsMet) {
          continue;
        }

        // Try to acquire lock
        const locked = this.conflictRegistry.acquireLock(
          node.request.entity,
          node.request.targetId,
        );
        if (!locked) {
          nodeStatus.set(node.id, 'failed');
          failedNodeId = node.id;
          failureError = `Conflict lock acquisition failed for target ${node.request.targetId}`;
          processedAny = true;
          break;
        }

        // Execute via governance
        try {
          const outcome = await this.governance.govern(
            node.adapter,
            node.request,
            ctx,
          );
          this.conflictRegistry.releaseLock(
            node.request.entity,
            node.request.targetId,
          );

          if (outcome.status === 'executed' && outcome.result?.ok) {
            nodeStatus.set(node.id, 'success');
            executedNodeIds.push(node.id);
            if (outcome.result.rollback) {
              rollbackStack.push({
                nodeId: node.id,
                adapter: node.adapter,
                handle: outcome.result.rollback,
              });
            }
          } else {
            nodeStatus.set(node.id, 'failed');
            failedNodeId = node.id;
            failureError =
              outcome.status === 'blocked'
                ? 'Action was blocked by governance'
                : 'Action execution failed';
          }
        } catch (err: any) {
          this.conflictRegistry.releaseLock(
            node.request.entity,
            node.request.targetId,
          );
          nodeStatus.set(node.id, 'failed');
          failedNodeId = node.id;
          failureError = err.message ?? 'Unknown execution error';
        }

        processedAny = true;
      }
    }

    // Check if there are any remaining pending nodes that couldn't be run
    if (!failedNodeId) {
      for (const node of bundle.nodes) {
        if (nodeStatus.get(node.id) === 'pending') {
          failedNodeId = node.id;
          failureError = 'Cyclic dependency or unresolvable node path';
          break;
        }
      }
    }

    // Rollback phase on failure
    if (failedNodeId) {
      await this.governance.supabase.rollbackTransaction();
      const rolledBack = rollbackStack.length > 0;
      // Reverse order rollback
      while (rollbackStack.length > 0) {
        const item = rollbackStack.pop()!;
        if (item.adapter.rollback) {
          try {
            await item.adapter.rollback(item.handle);
          } catch (err: any) {
            // Log rollback failure, but continue rolling back the rest
            this.logger.error(`Rollback failed for node ${item.nodeId}:`, {
              error: err.message || String(err),
            });
          }
        } else {
          this.logger.warn(`Rollback not supported by adapter '${item.adapter.platform}' for node ${item.nodeId}`);
        }
      }

      return {
        ok: false,
        executedNodeIds,
        failedNodeId,
        error: failureError,
        rolledBack,
      };
    }

    await this.governance.supabase.commitTransaction();
    return {
      ok: true,
      executedNodeIds,
      rolledBack: false,
    };
  }
}
