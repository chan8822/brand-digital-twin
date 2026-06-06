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
    name = "analyst_agent",
    srcs = ["agents/analyst_agent.ts"],
    deps = [
        ":isolation_context",
        ":onemcp_server",
        "//experimental/brand_twin:poas_calculator",
        "//experimental/brand_twin:supabase_client",
        "//experimental/brand_twin:unified_brain",
    ],
)

ts_library(
    name = "risk_radar_agent",
    srcs = ["agents/risk_radar_agent.ts"],
    deps = [
        ":isolation_context",
        ":onemcp_server",
        "//experimental/brand_twin:audit_sink",
        "//experimental/brand_twin:google_ads_adapter",
        "//experimental/brand_twin:governance_engine",
        "//experimental/brand_twin:risk_radar",
        "//experimental/brand_twin:supabase_client",
    ],
)

ts_library(
    name = "governance_shadow_agent",
    srcs = ["agents/governance_shadow_agent.ts"],
    deps = [
        ":isolation_context",
        ":onemcp_server",
        "//experimental/brand_twin:governance_types",
        "//experimental/brand_twin:opa_policy",
        "//experimental/brand_twin:platform_adapter",
    ],
)

ts_library(
    name = "ceo_agent",
    srcs = ["agents/ceo_agent.ts"],
    deps = [
        ":isolation_context",
        ":onemcp_server",
    ],
)

ts_library(
    name = "enterprise_os_tests",
    testonly = True,
    srcs = [
        "enterprise_os_test.ts",
    ],
    deps = [
        ":analyst_agent",
        ":ceo_agent",
        ":governance_shadow_agent",
        ":isolation_context",
        ":onemcp_server",
        ":risk_radar_agent",
        "//experimental/brand_twin:supabase_client",
        "//third_party/javascript/typings/jasmine",
    ],
)

jasmine_node_test(
    name = "enterprise_os_test",
    srcs = [":enterprise_os_tests"],
)
