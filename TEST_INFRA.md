# E2E Test Infra: Brand Digital Twin Phase B & Hardening / Private Beta

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Hard-Delete Cascade & Grace Period | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 2 | Signed JSON Export | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 3 | Legal Consent Acceptance | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 4 | Operations: /ready Health Check | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |
| 5 | Observability Alerting & Logs | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |
| 6 | Email Verification & OAuth Connect | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ |
| 7 | Quota Limits & Trust Tier Ceilings | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ |
| 8 | Atomic Job Claiming (Concurrency) | ORIGINAL_REQUEST R5 | 5 | 5 | ✓ |
| 9 | Secret Resolution Validation (P1.5) | 5 | 5 | ✓ | ✓ |
| 10| Log Redaction & Security (P1.6) | 5 | 5 | ✓ | ✓ |
| 11| Load & Concurrency (P1.7) | 5 | 5 | ✓ | ✓ |
| 12| Beta Telemetry & COGS Provenance (P2.1-2.3) | 5 | 5 | ✓ | ✓ |
| 13| Invite Allowlist (P2.4) | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: Executed via `blaze test :e2e_test` or `./tests/e2e/run_e2e_tests.sh`.
- Test case format: Jasmine specifications using a mock server and mock db when running in sandbox, and support for real PostgreSQL database when configured.
- Directory layout:
  - `experimental/brand_twin/tests/e2e/specs/data_rights_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/legal_consent_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/ready_health_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/public_abuse_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/job_claiming_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/claim_concurrency_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/secrets_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/security_redaction_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/load_concurrency_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/beta_telemetry_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/invite_allowlist_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/cross_feature_e2e_test.ts`
  - `experimental/brand_twin/tests/e2e/specs/real_world_workloads_e2e_test.ts`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Case 56: Private Beta Onboarding & Activation | F12, F13 | High |
| 2 | Case 57: Concurrency Load Sweep (IP rate limits) | F11 | High |
| 3 | Case 58: Secret Rotation Event | F9 | Medium |
| 4 | Case 59: Adversarial Security Attack | F10 | Medium |
| 5 | Case 60: System Outage / Database Recovery Event | F4, F5, F8 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic application scenarios
