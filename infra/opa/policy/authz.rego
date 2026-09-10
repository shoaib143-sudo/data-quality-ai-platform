package system.authz

default allow := false

# Render can probe readiness without possessing the policy-decision credential.
allow if {
	input.method == "GET"
	input.path == ["health"]
}

# Expose exactly one authenticated OPA data API path. The bearer token is
# supplied by OPA's token authentication mode as input.identity and compared
# against the runtime secret without committing the credential to policy data.
allow if {
	input.method == "POST"
	input.path == ["v1", "data", "datanexus", "autonomy", "decision"]
	token := opa.runtime().env.OPA_AUTH_TOKEN
	token != ""
	input.identity == token
}
