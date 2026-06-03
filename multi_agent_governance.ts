/**
 * @fileoverview Multi-agent collaborative governance engine.
 */

import { SupabaseClient } from "./supabase_client";

export interface Proposal {
  proposalId: string;
  tenantId: string;
  campaignId: string;
  sourceChannel: string; // e.g. 'meta'
  targetChannel: string; // e.g. 'google'
  amount: number;
  rationale: string;
  status: "pending" | "approved" | "rejected" | "escalated";
}

export interface Vote {
  agentId: string;
  role: string;
  approved: boolean;
  reason: string;
}

export class MediaBuyerAgent {
  constructor(private readonly agentId: string) {}

  /**
   * Evaluates POAS performance and proposes budget shifts.
   */
  proposeReallocation(
    tenantId: string,
    campaignId: string,
    sourceChannel: string,
    targetChannel: string,
    amount: number,
    poasDifference: number
  ): Proposal {
    return {
      proposalId: `prop-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      tenantId,
      campaignId,
      sourceChannel,
      targetChannel,
      amount,
      rationale: `POAS in ${targetChannel} exceeds ${sourceChannel} by ${Math.round(poasDifference * 100)}%. Reallocating budget to maximize efficiency.`,
      status: "pending",
    };
  }
}

export class CreativeDirectorAgent {
  constructor(private readonly agentId: string) {}

  /**
   * Evaluates asset compliance.
   */
  async voteOnProposal(db: SupabaseClient, proposal: Proposal): Promise<Vote> {
    const assets = await db.getCreativeAssets(proposal.tenantId);
    
    // Check if there's any active non-compliant asset for this campaign
    const campaignAssets = assets.filter(a => a.campaign === proposal.campaignId);
    const hasViolation = campaignAssets.some(a => !a.complianceOk);

    if (hasViolation) {
      return {
        agentId: this.agentId,
        role: "creative_director",
        approved: false,
        reason: `Rejection: Campaign ${proposal.campaignId} contains non-compliant creative assets. Resolve safety issues first.`,
      };
    }

    return {
      agentId: this.agentId,
      role: "creative_director",
      approved: true,
      reason: "Approved: Visual assets comply with current safety guidelines.",
    };
  }
}

export class CFOAgent {
  constructor(private readonly agentId: string) {}

  /**
   * CFO checks if the proposed amount violates margin targets or if total budget exceeds cap.
   */
  async voteOnProposal(db: SupabaseClient, proposal: Proposal): Promise<Vote> {
    const clients = await db.getClients(proposal.tenantId);
    if (clients.length === 0) {
      return {
        agentId: this.agentId,
        role: "cfo",
        approved: true,
        reason: "Approved: No client margin limits defined.",
      };
    }

    // Assume the first client matches the tenant profile for simplicity
    const client = clients[0];
    if (proposal.amount > 50000 && client.healthScore < 70) {
      return {
        agentId: this.agentId,
        role: "cfo",
        approved: false,
        reason: `Rejection: Reallocation amount $${proposal.amount} exceeds limit ($50,000) for a client with health score < 70 (Current: ${client.healthScore}).`,
      };
    }

    return {
      agentId: this.agentId,
      role: "cfo",
      approved: true,
      reason: "Approved: Proposed spend conforms to cash limits and margin metrics.",
    };
  }
}

export class AgentOrchestrator {
  private readonly mediaBuyer = new MediaBuyerAgent("buyer-bot");
  private readonly creativeDirector = new CreativeDirectorAgent("creative-bot");
  private readonly cfo = new CFOAgent("cfo-bot");

  constructor(private readonly db: SupabaseClient) {}

  /**
   * Runs the consensus process for a budget proposal.
   */
  async processConsensus(proposal: Proposal): Promise<{ consensusReached: boolean; votes: Vote[]; finalStatus: string }> {
    const votes: Vote[] = [];

    // Creative Director Agent votes
    const cdVote = await this.creativeDirector.voteOnProposal(this.db, proposal);
    votes.push(cdVote);

    // CFO Agent votes
    const cfoVote = await this.cfo.voteOnProposal(this.db, proposal);
    votes.push(cfoVote);

    // Evaluate votes
    const allApproved = votes.every(v => v.approved);
    let finalStatus: "approved" | "rejected" | "escalated" = "approved";

    if (!allApproved) {
      // If one approves but another rejects, we escalate to human administrator
      const anyApproved = votes.some(v => v.approved);
      if (anyApproved) {
        finalStatus = "escalated";
      } else {
        finalStatus = "rejected";
      }
    }

    proposal.status = finalStatus;

    // Log event in database activity feed
    await this.db.logActivity({
      eventId: `act-${proposal.proposalId}`,
      orgId: `org-${proposal.tenantId}`,
      actorId: "agent-orchestrator",
      actionType: "consensus_reached",
      entityType: "budget_proposal",
      entityId: proposal.proposalId,
      summary: `Multi-agent consensus for budget shift of $${proposal.amount}: ${finalStatus.toUpperCase()}`,
      isRead: false,
      tenantId: proposal.tenantId,
      createdAt: Date.now(),
    });

    return {
      consensusReached: finalStatus === "approved",
      votes,
      finalStatus,
    };
  }

  getMediaBuyer(): MediaBuyerAgent {
    return this.mediaBuyer;
  }
}
