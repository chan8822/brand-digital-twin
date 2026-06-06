load("//javascript/typescript:build_defs.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "specs",
    testonly = True,
    srcs = [
        "data_rights_e2e_test.ts",
        "job_claiming_e2e_test.ts",
        "legal_consent_e2e_test.ts",
        "load_concurrency_e2e_test.ts",
        "public_abuse_e2e_test.ts",
        "ready_health_e2e_test.ts",
    ],
    deps = [
        "//experimental/brand_twin/github_export:auth",
        "//experimental/brand_twin/github_export:config",
        "//experimental/brand_twin/github_export:errors",
        "//experimental/brand_twin/github_export:event_bus",
        "//experimental/brand_twin/github_export:google_ads_adapter",
        "//experimental/brand_twin/github_export:governance_engine",
        "//experimental/brand_twin/github_export:observability",
        "//experimental/brand_twin/github_export:platform_adapter",
        "//experimental/brand_twin/github_export:poas_calculator",
        "//experimental/brand_twin/github_export:poas_scheduler",
        "//experimental/brand_twin/github_export:rate_limiter",
        "//experimental/brand_twin/github_export:secret_provider",
        "//experimental/brand_twin/github_export:server",
        "//experimental/brand_twin/github_export:supabase_client",
        "//experimental/brand_twin/github_export:unified_brain",
        "//experimental/brand_twin/github_export:user_auth",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "real_load_test_lib",
    testonly = True,
    srcs = ["real_load_test.ts"],
    deps = [
        "//experimental/brand_twin/github_export:auth",
        "//experimental/brand_twin/github_export:config",
        "//experimental/brand_twin/github_export:event_bus",
        "//experimental/brand_twin/github_export:server",
        "//experimental/brand_twin/github_export:supabase_client",
        "//experimental/brand_twin/github_export:user_auth",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/typings/node",
    ],
)
