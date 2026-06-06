load("//javascript/typescript:build_defs.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "specs",
    testonly = True,
    srcs = [
        "beta_telemetry_e2e_test.ts",
        "cross_feature_e2e_test.ts",
        "data_rights_e2e_test.ts",
        "invite_allowlist_e2e_test.ts",
        "job_claiming_e2e_test.ts",
        "legal_consent_e2e_test.ts",
        "load_concurrency_e2e_test.ts",
        "public_abuse_e2e_test.ts",
        "ready_health_e2e_test.ts",
        "real_world_workloads_e2e_test.ts",
        "secrets_e2e_test.ts",
        "security_redaction_e2e_test.ts",
    ],
    deps = [
        "//experimental/brand_twin:auth",
        "//experimental/brand_twin:config",
        "//experimental/brand_twin:errors",
        "//experimental/brand_twin:event_bus",
        "//experimental/brand_twin:google_ads_adapter",
        "//experimental/brand_twin:governance_engine",
        "//experimental/brand_twin:managed_secret_provider",
        "//experimental/brand_twin:observability",
        "//experimental/brand_twin:orchestrator",
        "//experimental/brand_twin:platform_adapter",
        "//experimental/brand_twin:poas_calculator",
        "//experimental/brand_twin:poas_scheduler",
        "//experimental/brand_twin:rate_limiter",
        "//experimental/brand_twin:scrubber",
        "//experimental/brand_twin:secret_provider",
        "//experimental/brand_twin:server",
        "//experimental/brand_twin:supabase_client",
        "//experimental/brand_twin:unified_brain",
        "//experimental/brand_twin:user_auth",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/typings/node",
    ],
)

ts_library(
    name = "real_load_test_lib",
    testonly = True,
    srcs = ["real_load_test.ts"],
    deps = [
        "//experimental/brand_twin:auth",
        "//experimental/brand_twin:config",
        "//experimental/brand_twin:event_bus",
        "//experimental/brand_twin:server",
        "//experimental/brand_twin:supabase_client",
        "//experimental/brand_twin:user_auth",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/typings/node",
    ],
)
