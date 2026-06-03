package brand_twin.safety

# By default, actions are blocked
default allow = false

# Rule 1: Allow low-risk actions for trusted tenants
allow {
    not input.tenant_anomaly
    input.cost < 1000
    input.trust_tier >= 2
    is_allowed_op(input.op)
}

# Rule 2: Allow high-risk actions ONLY with CFO/CMO waiver
allow {
    not input.tenant_anomaly
    input.cost >= 1000
    has_valid_waiver(input.waivers, "CFO", input.op, input.current_time_ms)
}

# Rule 3: Allow medium-risk actions with Media Buyer or Manager waiver
allow {
    not input.tenant_anomaly
    input.cost >= 1000
    input.cost < 5000
    has_valid_waiver(input.waivers, "Media Buyer", input.op, input.current_time_ms)
}

# Helper to check allowed operations
is_allowed_op(op) {
    allowed_ops := ["read", "update_budget", "pause", "activate", "scale_budget"]
    allowed_ops[_] == op
}

# Helper to check if a valid waiver exists
has_valid_waiver(waivers, required_role, op, current_time_ms) {
    waiver := waivers[_]
    waiver.overrideRole == required_role
    waiver.expiresAtMs > current_time_ms
    is_op_in_list(op, waiver.allowedOps)
}

is_op_in_list(op, ops) {
    ops[_] == op
}
