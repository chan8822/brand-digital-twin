// Phase 1 — Identity Resolver.
// Clusters email/phone identifiers into unified customer profiles.
// Resolves identity links using connected components graph logic.

import { createHash } from "node:crypto";

export interface IdentityInput {
  identifierType: "email" | "phone" | "device";
  rawIdentifier: string;
}

export interface ResolutionResult {
  customerId: string;
  isNew: boolean;
  mergedFromCustomerId?: string; // If a merge occurred
}

const sha256 = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex");

export class IdentityResolver {
  // Mock in-memory DB representation for demonstration/testing
  // In production, this would query/update BigQuery or Spanner
  private identityLinks: Map<string, { customerId: string; confidence: number }> = new Map(); // hash -> link
  private customerProfiles: Map<string, any> = new Map(); // customerId -> profile

  constructor(private tenantId: string) {}

  /**
   * Helper to seed existing identity links (e.g., loaded from database).
   */
  seedExistingLink(hash: string, customerId: string, confidence = 1.0) {
    this.identityLinks.set(hash, { customerId, confidence });
    if (!this.customerProfiles.has(customerId)) {
      this.customerProfiles.set(customerId, {
        customer_id: customerId,
        tenant_id: this.tenantId,
        first_seen: new Date().toISOString(),
      });
    }
  }

  /**
   * Resolves a set of identifiers to a single customer_id.
   * If they match multiple different customerIds, they are merged.
   * If they don't match any, a new customerId is generated.
   */
  resolve(inputs: IdentityInput[]): ResolutionResult {
    if (inputs.length === 0) {
      // Fallback: anonymous customer
      const anonId = "anon_" + sha256(Math.random().toString());
      return { customerId: anonId, isNew: true };
    }

    const hashes = inputs.map(i => sha256(i.rawIdentifier));
    
    // Find all matching customer IDs
    const matchedCustomerIds = new Set<string>();
    for (const h of hashes) {
      const existing = this.identityLinks.get(h);
      if (existing) {
        matchedCustomerIds.add(existing.customerId);
      }
    }

    // Case 1: No match. Generate a new customer ID.
    if (matchedCustomerIds.size === 0) {
      // Use the SHA256 of the first identifier as customerId to keep it deterministic
      const customerId = sha256(inputs[0].rawIdentifier);
      
      // Register all hashes
      for (const h of hashes) {
        this.identityLinks.set(h, { customerId, confidence: 1.0 });
      }
      
      this.customerProfiles.set(customerId, {
        customer_id: customerId,
        tenant_id: this.tenantId,
        first_seen: new Date().toISOString(),
      });

      return { customerId, isNew: true };
    }

    // Case 2: Match exactly one customer ID. Link any new hashes.
    if (matchedCustomerIds.size === 1) {
      const customerId = Array.from(matchedCustomerIds)[0];
      for (const h of hashes) {
        if (!this.identityLinks.has(h)) {
          this.identityLinks.set(h, { customerId, confidence: 1.0 });
        }
      }
      return { customerId, isNew: false };
    }

    // Case 3: Merge condition. Match multiple different customer IDs!
    // We choose the oldest/first customer ID as target, and merge the other(s) into it.
    const sortedIds = Array.from(matchedCustomerIds).sort(); // simple tie-breaker
    const targetCustomerId = sortedIds[0];
    const sourceCustomerId = sortedIds[1]; // Merge source

    // Relink all hashes pointing to the source customer ID to the target customer ID
    for (const [hash, link] of this.identityLinks.entries()) {
      if (link.customerId === sourceCustomerId) {
        this.identityLinks.set(hash, { customerId: targetCustomerId, confidence: 0.9 }); // Reduced confidence for merged links
      }
    }

    // Link the incoming hashes to the target customer ID
    for (const h of hashes) {
      this.identityLinks.set(h, { customerId: targetCustomerId, confidence: 1.0 });
    }

    // Remove merged profile from profiles
    this.customerProfiles.delete(sourceCustomerId);

    return {
      customerId: targetCustomerId,
      isNew: false,
      mergedFromCustomerId: sourceCustomerId,
    };
  }

  getLinks(): Map<string, { customerId: string; confidence: number }> {
    return this.identityLinks;
  }
}
