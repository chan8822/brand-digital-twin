load(
    "//javascript/angular/tools/node/jasmine/builddefs:jasmine_node.bzl",
    "jasmine_node_test",
)
load("//javascript/typescript:build_defs.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "platform_adapter",
    srcs = ["platform_adapter.ts"],
    deps = [],
)

ts_library(
    name = "healing_types",
    srcs = ["healing_types.ts"],
    deps = [
        ":platform_adapter",
    ],
)

ts_library(
    name = "observability",
    srcs = ["observability.ts"],
    deps = [],
)

ts_library(
    name = "forecasting",
    srcs = ["forecasting.ts"],
    deps = [],
)

ts_library(
    name = "orchestrator",
    srcs = ["orchestrator.ts"],
    deps = [
        ":governance_engine",
        ":platform_adapter",
    ],
)

ts_library(
    name = "governance_shadow",
    srcs = ["governance_shadow.ts"],
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "shopify_adapter",
    srcs = ["shopify_adapter.ts"],
    deps = [
        ":platform_adapter",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "woocommerce_adapter",
    srcs = ["woocommerce_adapter.ts"],
    deps = [
        ":platform_adapter",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "magento_adapter",
    srcs = ["magento_adapter.ts"],
    deps = [
        ":platform_adapter",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "google_ads_adapter",
    srcs = ["google_ads_adapter.ts"],
    deps = [
        ":agency_os_types",
        ":observability",
        ":platform_adapter",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "google_merchant_adapter",
    srcs = ["google_merchant_adapter.ts"],
    deps = [
        ":agency_os_types",
        ":observability",
    ],
)

ts_library(
    name = "meta_ads_adapter",
    srcs = ["meta_ads_adapter.ts"],
    deps = [
        ":observability",
        ":platform_adapter",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "identity_resolver",
    srcs = ["identity_resolver.ts"],
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "analyst_agent",
    srcs = ["analyst_agent.ts"],
    deps = [],
)

ts_library(
    name = "governance_types",
    srcs = ["governance_types.ts"],
    deps = [],
)

ts_library(
    name = "opa_policy",
    srcs = ["opa_policy.ts"],
    deps = [
        ":errors",
        ":governance_types",
        ":platform_adapter",
    ],
)

ts_library(
    name = "agency_os_types",
    srcs = ["agency_os_types.ts"],
    deps = [],
)

ts_library(
    name = "supabase_client",
    srcs = ["supabase_client.ts"],
    deps = [
        ":agency_os_types",
        ":errors",
        ":healing_types",
        ":observability",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "agency_os",
    srcs = ["agency_os.ts"],
    deps = [
        ":agency_os_types",
        ":governance_engine",
        ":governance_types",
        ":observability",
        ":platform_adapter",
        ":supabase_client",
    ],
)

ts_library(
    name = "governance_engine",
    srcs = ["governance_engine.ts"],
    deps = [
        ":agency_os_types",
        ":errors",
        ":event_bus",
        ":governance_types",
        ":observability",
        ":opa_policy",
        ":platform_adapter",
        ":supabase_client",
    ],
)

ts_library(
    name = "tally_adapter",
    srcs = ["tally_adapter.ts"],
    deps = [],
)

ts_library(
    name = "bank_adapter",
    srcs = ["bank_adapter.ts"],
    deps = [],
)

ts_library(
    name = "plaid_adapter",
    srcs = ["plaid_adapter.ts"],
    deps = [
        ":bank_adapter",
    ],
)

ts_library(
    name = "rbi_aa_adapter",
    srcs = ["rbi_aa_adapter.ts"],
    deps = [
        ":bank_adapter",
    ],
)

ts_library(
    name = "whatsapp_adapter",
    srcs = ["whatsapp_adapter.ts"],
    deps = [
        ":platform_adapter",
    ],
)

ts_library(
    name = "risk_radar",
    srcs = ["risk_radar.ts"],
    deps = [
        ":bank_adapter",
        ":google_ads_adapter",
        ":governance_engine",
        ":healing_types",
        ":platform_adapter",
        ":supabase_client",
    ],
)

ts_library(
    name = "simulation",
    srcs = ["simulation.ts"],
    deps = [
        ":governance_engine",
        ":governance_types",
        ":platform_adapter",
    ],
)

ts_library(
    name = "rate_limiter",
    srcs = ["rate_limiter.ts"],
    deps = [
        ":platform_adapter",
    ],
)

ts_library(
    name = "google_express",
    srcs = ["google_express.ts"],
    deps = [],
)

ts_library(
    name = "onboarding_simulator",
    srcs = ["onboarding_simulator.ts"],
    deps = [
        ":google_ads_adapter",
        ":governance_engine",
        ":healing_types",
        ":poas_calculator",
        ":risk_radar",
        ":supabase_client",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "workspace_connectors",
    srcs = ["workspace_connectors.ts"],
    deps = [
        ":agency_os_types",
        ":supabase_client",
    ],
)

ts_library(
    name = "operational_hubs",
    srcs = ["operational_hubs.ts"],
    deps = [
        ":agency_os_types",
        ":supabase_client",
    ],
)

ts_library(
    name = "unified_brain",
    srcs = ["unified_brain.ts"],
    deps = [
        ":agency_os_types",
        ":forecasting",
        ":healing_types",
        ":poas_calculator",
        ":risk_radar",
        ":supabase_client",
    ],
)

ts_library(
    name = "account_health",
    srcs = ["account_health.ts"],
    deps = [
        ":forecasting",
        ":supabase_client",
        ":unified_brain",
    ],
)

ts_library(
    name = "multi_agent_governance",
    srcs = ["multi_agent_governance.ts"],
    deps = [
        ":supabase_client",
    ],
)

ts_library(
    name = "attribution_engine",
    srcs = ["attribution_engine.ts"],
    deps = [],
)

ts_library(
    name = "incident_response",
    srcs = ["incident_response.ts"],
    deps = [
        ":supabase_client",
    ],
)

ts_library(
    name = "onboarding_wizard",
    srcs = ["onboarding_wizard.ts"],
    deps = [
        ":agency_os_types",
        ":google_ads_adapter",
        ":google_merchant_adapter",
        ":governance_engine",
        ":supabase_client",
    ],
)

ts_library(
    name = "stakeholder_portal_manager",
    srcs = ["stakeholder_portal_manager.ts"],
    deps = [
        ":agency_os_types",
        ":supabase_client",
    ],
)

ts_library(
    name = "easysaas_orchestration",
    srcs = ["easysaas_orchestration.ts"],
    deps = [],
)

ts_library(
    name = "config",
    srcs = ["config.ts"],
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "errors",
    srcs = ["errors.ts"],
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "event_bus",
    srcs = ["event_bus.ts"],
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "auth",
    srcs = ["auth.ts"],
    deps = [
        ":errors",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "user_auth",
    srcs = ["user_auth.ts"],
    deps = [
        ":auth",
        ":config",
        ":errors",
        ":supabase_client",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "validation",
    srcs = ["validation.ts"],
    deps = [
        ":errors",
        ":governance_types",
        ":platform_adapter",
    ],
)

ts_library(
    name = "ingestion_engine",
    srcs = ["ingestion_engine.ts"],
    deps = [
        ":platform_adapter",
        ":supabase_client",
    ],
)

ts_library(
    name = "poas_calculator",
    srcs = ["poas_calculator.ts"],
    deps = [
        ":healing_types",
        ":supabase_client",
    ],
)

ts_library(
    name = "poas_scheduler",
    srcs = ["poas_scheduler.ts"],
    deps = [
        ":agency_os_types",
        ":governance_engine",
        ":platform_adapter",
        ":poas_calculator",
        ":supabase_client",
    ],
)

ts_library(
    name = "coverage_monitor",
    srcs = ["coverage_monitor.ts"],
    deps = [
        ":agency_os_types",
        ":supabase_client",
    ],
)

ts_library(
    name = "audit_sink",
    srcs = ["audit_sink.ts"],
    deps = [
        ":governance_types",
        ":supabase_client",
    ],
)

ts_library(
    name = "credential_vault",
    srcs = ["credential_vault.ts"],
    deps = [
        ":supabase_client",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "oauth_flows",
    srcs = ["oauth_flows.ts"],
    deps = [
        ":config",
        ":credential_vault",
        ":supabase_client",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "profit_readiness",
    srcs = ["profit_readiness.ts"],
    deps = [
        ":supabase_client",
    ],
)

ts_library(
    name = "server",
    srcs = ["server.ts"],
    deps = [
        ":audit_sink",
        ":auth",
        ":config",
        ":errors",
        ":event_bus",
        ":google_ads_adapter",
        ":governance_engine",
        ":healing_types",
        ":identity_resolver",
        ":oauth_flows",
        ":poas_calculator",
        ":profit_readiness",
        ":rate_limiter",
        ":risk_radar",
        ":supabase_client",
        ":unified_brain",
        ":user_auth",
        ":validation",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "brand_twin_tests",
    testonly = True,
    srcs = [
        "advanced_features_test.ts",
        "advanced_operations_test.ts",
        "agency_ops_test.ts",
        "agency_os_test.ts",
        "credential_vault_test.ts",
        "easysaas_test.ts",
        "integrations_test.ts",
        "omnichannel_test.ts",
        "onboarding_hierarchy_test.ts",
        "onboarding_simulator_test.ts",
        "phase1_test.ts",
        "phase1b_test.ts",
        "phase2_test.ts",
        "phase3_test.ts",
        "phase4_test.ts",
        "gdpr_legal_test.ts",
        "plaid_adapter_test.ts",
        "poas_scheduler_test.ts",
        "server_test.ts",
        "shopify_adapter_test.ts",
        "stakeholder_portal_test.ts",
        "supabase_client_test.ts",
        "user_auth_test.ts",
        "auth_test.ts",
        "oauth_flows_test.ts",
        "profit_readiness_test.ts",
    ],
    deps = [
        ":auth",
        ":account_health",
        ":agency_os",
        ":agency_os_types",
        ":attribution_engine",
        ":config",
        ":coverage_monitor",
        ":credential_vault",
        ":easysaas_orchestration",
        ":errors",
        ":event_bus",
        ":forecasting",
        ":google_ads_adapter",
        ":google_express",
        ":google_merchant_adapter",
        ":governance_engine",
        ":governance_types",
        ":oauth_flows",
        ":incident_response",
        ":ingestion_engine",
        ":magento_adapter",
        ":meta_ads_adapter",
        ":multi_agent_governance",
        ":observability",
        ":onboarding_simulator",
        ":onboarding_wizard",
        ":opa_policy",
        ":operational_hubs",
        ":orchestrator",
        ":platform_adapter",
        ":poas_calculator",
        ":profit_readiness",
        ":bank_adapter",
        ":plaid_adapter",
        ":poas_scheduler",
        ":rate_limiter",
        ":rbi_aa_adapter",
        ":risk_radar",
        ":server",
        ":shopify_adapter",
        ":simulation",
        ":stakeholder_portal_manager",
        ":supabase_client",
        ":tally_adapter",
        ":unified_brain",
        ":user_auth",
        ":whatsapp_adapter",
        ":woocommerce_adapter",
        ":workspace_connectors",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/typings/node",
    ],
)

jasmine_node_test(
    name = "shopify_adapter_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "phase1_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "credential_vault_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "phase1b_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "phase2_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "phase3_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "phase4_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "advanced_features_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "onboarding_simulator_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "onboarding_hierarchy_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "integrations_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "agency_os_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "advanced_operations_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "stakeholder_portal_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "easysaas_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "server_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "supabase_client_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "omnichannel_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "poas_scheduler_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "plaid_adapter_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "user_auth_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "auth_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "oauth_flows_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "profit_readiness_test",
    srcs = [":brand_twin_tests"],
)

jasmine_node_test(
    name = "gdpr_legal_test",
    srcs = [":brand_twin_tests"],
)

ts_library(
    name = "e2e_test_lib",
    testonly = True,
    srcs = [
        "tests/e2e/claim_concurrency_test.ts",
        "tests/e2e/specs/data_rights_e2e_test.ts",
        "tests/e2e/specs/job_claiming_e2e_test.ts",
        "tests/e2e/specs/legal_consent_e2e_test.ts",
        "tests/e2e/specs/public_abuse_e2e_test.ts",
        "tests/e2e/specs/ready_health_e2e_test.ts",
    ],
    deps = [
        ":auth",
        ":config",
        ":errors",
        ":event_bus",
        ":google_ads_adapter",
        ":governance_engine",
        ":observability",
        ":orchestrator",
        ":platform_adapter",
        ":poas_calculator",
        ":poas_scheduler",
        ":rate_limiter",
        ":server",
        ":supabase_client",
        ":unified_brain",
        ":user_auth",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/typings/node",
    ],
)

jasmine_node_test(
    name = "e2e_test",
    srcs = [":e2e_test_lib"],
)
