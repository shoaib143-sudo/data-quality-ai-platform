package datanexus.autonomy

# OPA is an enforcement point over an already-resolved canonical DataNexus
# policy version. It may never manufacture governance authority. A malformed,
# stale, or unapproved canonical envelope intentionally produces no decision;
# the application provider treats that as DENY.
decision := result if {
	canonical := input.canonical
	request := input.request

	canonical.authority_status == "APPROVED"
	canonical.decision in {"ALLOW", "REQUIRE_APPROVAL", "DENY"}
	is_string(canonical.policy_version_id)
	canonical.policy_version_id != ""

	is_string(request.project_id)
	request.project_id != ""
	is_string(request.action_key)
	request.action_key != ""
	is_string(request.target_type)
	request.target_type != ""

	result := {
		"decision": canonical.decision,
		"policy_version_id": canonical.policy_version_id,
		"reason": "OPA preserved the canonical DataNexus governance decision.",
	}
}
