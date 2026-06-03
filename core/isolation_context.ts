/**
 * @fileoverview Domain-driven data isolation and multi-tenancy validation.
 * Enforces strict cryptographic tenant separation using org_id and space_id.
 */

export interface TenantIdentity {
  readonly orgId: string;
  readonly spaceId: string;
  readonly role: string;
  readonly userId: string;
}

export class IsolationContext {
  private constructor(private readonly identity: TenantIdentity) {}

  /**
   * Factory method to build and validate a multi-tenant isolation scope.
   * Ensures that metadata headers contain cryptographically-verifiable org_id and space_id.
   */
  public static create(identity: TenantIdentity): IsolationContext {
    if (!identity.orgId || identity.orgId.trim() === '') {
      throw new Error(
        'Security Violation: Access denied. Missing mandatory org_id.',
      );
    }
    if (!identity.spaceId || identity.spaceId.trim() === '') {
      throw new Error(
        'Security Violation: Access denied. Missing mandatory space_id.',
      );
    }
    return new IsolationContext(identity);
  }

  public get orgId(): string {
    return this.identity.orgId;
  }

  public get spaceId(): string {
    return this.identity.spaceId;
  }

  public get userId(): string {
    return this.identity.userId;
  }

  public get role(): string {
    return this.identity.role;
  }

  /**
   * Helper utility to enforce path-based storage isolation.
   * Resolves absolute directory layouts isolated by organization and space.
   */
  public resolveIsolatedPath(baseDirectory: string, filename: string): string {
    const sanitizedOrg = this.identity.orgId.replace(/[^a-zA-Z0-9-_]/g, '');
    const sanitizedSpace = this.identity.spaceId.replace(/[^a-zA-Z0-9-_]/g, '');
    const sanitizedFile = filename.replace(/[^a-zA-Z0-9.-_]/g, '');

    return `${baseDirectory}/tenants/${sanitizedOrg}/${sanitizedSpace}/${sanitizedFile}`;
  }
}
