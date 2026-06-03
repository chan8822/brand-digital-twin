# Agency OS Master Agent Manifest

This manifest acts as the North Star for all programmatic agents running within the Agency OS multi-tenant ecosystem. It outlines roles, access controls, tools, and isolation policies.

## 1. System Architect Matrix

| Agent Identifier | Domain Bounded Context | Standardized Tools Allowed | Security Isolation Scope |
| :--- | :--- | :--- | :--- |
| `OrganizationCEOAgent` | Ecosystem & Orchestration | `coordinate_agents`, `list_tenants` | Root tenant level (`org_id` bound) |
| `IntelligentAnalystAgent`| Business Intel & POAS | `optimize_margins`, `query_poas_sql` | Restriced space level (`space_id` bound) |
| `RiskRadarAgent` | Downstream Supply Chain | `inventory_alert_correlation` | Product/Inventory tracking |
| `GovernanceShadowAgent`  | Safety Interceptors & Audit | `verify_policy_compliance` | Immutable system level |

## 2. Multi-Tenant Path Isolation Policy
All agents are strictly sandboxed at runtime. File read and database transactions must execute through the `IsolationContext` resolver:
- Base DB queries are partitioned utilizing `$orgId` and `$spaceId`.
- No cross-tenant metadata evaluation is permitted.

## 3. Tool-Calling Specification (OneMCP Compliance)
All tool parameters must be formally validated using strict JSON Schema standard specifications to prevent injection or invalid parameter formatting.
