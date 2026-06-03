load(
    "//javascript/angular/tools/node/jasmine/builddefs:jasmine_node.bzl",
    "jasmine_node_test",
)
load("//javascript/typescript:build_defs.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "isolation_context",
    srcs = ["core/isolation_context.ts"],
    deps = [],
)

ts_library(
    name = "onemcp_server",
    srcs = ["core/onemcp_server.ts"],
    deps = [
        ":isolation_context",
    ],
)

ts_library(
    name = "ceo_agent",
    srcs = [
        "account_health.ts",
        "agency_os.ts",
        "agency_os_types.ts",
        "agents/ceo_agent.ts",
        "analyst_agent.ts",
        "attribution_engine.ts",
        "easysaas_orchestration.ts",
        "forecasting.ts",
        "google_ads_adapter.ts",
        "google_express.ts",
        "governance_engine.ts",
        "governance_shadow.ts",
        "governance_types.ts",
        "identity_resolver.ts",
        "incident_response.ts",
        "meta_ads_adapter.ts",
        "multi_agent_governance.ts",
        "observability.ts",
        "onboarding_simulator.ts",
        "onboarding_wizard.ts",
        "opa_policy.ts",
        "operational_hubs.ts",
        "orchestrator.ts",
        "platform_adapter.ts",
        "rate_limiter.ts",
        "rbi_aa_adapter.ts",
        "risk_radar.ts",
        "shopify_adapter.ts",
        "simulation.ts",
        "stakeholder_portal_manager.ts",
        "supabase_client.ts",
        "tally_adapter.ts",
        "unified_brain.ts",
        "whatsapp_adapter.ts",
        "workspace_connectors.ts",
    ],
    deps = [
        ":isolation_context",
        ":onemcp_server",
    ],
)

ts_library(
    name = "enterprise_os_tests",
    testonly = True,
    srcs = [
        "advanced_features_test.ts",
        "advanced_operations_test.ts",
        "agency_ops_test.ts",
        "agency_os_test.ts",
        "easysaas_test.ts",
        "enterprise_os_test.ts",
        "integrations_test.ts",
        "onboarding_simulator_test.ts",
        "phase1_test.ts",
        "phase2_test.ts",
        "phase3_test.ts",
        "phase4_test.ts",
        "shopify_adapter_test.ts",
        "stakeholder_portal_test.ts",
    ],
    deps = [
        ":ceo_agent",
        ":isolation_context",
        ":onemcp_server",
        "//third_party/javascript/typings/jasmine",
    ],
)

jasmine_node_test(
    name = "enterprise_os_test",
    srcs = [":enterprise_os_tests"],
)
