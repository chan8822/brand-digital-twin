load("//javascript/typescript:build_defs.bzl", "ts_library")
load(
    "//javascript/angular/tools/node/jasmine/builddefs:jasmine_node.bzl",
    "jasmine_node_test",
)

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
        ":isolation_context",
        ":onemcp_server",
        ":ceo_agent",
        "//third_party/javascript/typings/jasmine",
    ],
)

jasmine_node_test(
    name = "enterprise_os_test",
    srcs = [":enterprise_os_tests"],
)
