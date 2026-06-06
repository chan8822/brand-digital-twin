load("//javascript/typescript:build_defs.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "claim_concurrency",
    testonly = True,
    srcs = ["claim_concurrency_test.ts"],
    deps = [
        "//experimental/brand_twin:config",
        "//experimental/brand_twin:server",
        "//experimental/brand_twin:supabase_client",
        "//experimental/brand_twin:user_auth",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/typings/node",
    ],
)
