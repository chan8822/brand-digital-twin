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
    name = "governance_shadow",
    srcs = ["governance_shadow.ts"],
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "shopify_adapter",
    srcs = ["shopify_adapter.ts"],
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "google_ads_adapter",
    srcs = ["google_ads_adapter.ts"],
    deps = [
        ":platform_adapter",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "meta_ads_adapter",
    srcs = ["meta_ads_adapter.ts"],
    deps = [
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
    name = "governance_engine",
    srcs = ["governance_engine.ts"],
    deps = [
        ":platform_adapter",
    ],
)

ts_library(
    name = "tally_adapter",
    srcs = ["tally_adapter.ts"],
    deps = [],
)

ts_library(
    name = "rbi_aa_adapter",
    srcs = ["rbi_aa_adapter.ts"],
    deps = [],
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
        ":google_ads_adapter",
        ":governance_engine",
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
    deps = ["//third_party/javascript/typings/node"],
)

ts_library(
    name = "brand_twin_tests",
    testonly = True,
    srcs = [
        "onboarding_simulator_test.ts",
        "phase1_test.ts",
        "phase2_test.ts",
        "phase3_test.ts",
        "phase4_test.ts",
        "shopify_adapter_test.ts",
    ],
    deps = [
        ":analyst_agent",
        ":google_ads_adapter",
        ":google_express",
        ":governance_engine",
        ":identity_resolver",
        ":meta_ads_adapter",
        ":onboarding_simulator",
        ":platform_adapter",
        ":rbi_aa_adapter",
        ":risk_radar",
        ":shopify_adapter",
        ":tally_adapter",
        ":whatsapp_adapter",
        "//third_party/javascript/typings/jasmine",
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
    name = "onboarding_simulator_test",
    srcs = [":brand_twin_tests"],
)
