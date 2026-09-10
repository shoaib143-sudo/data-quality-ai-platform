package datanexus.autonomy_test

import data.datanexus.autonomy.decision

valid_input := {
	"request": {
		"project_id": "project-1",
		"action_key": "CREATE_GOVERNANCE_ISSUE",
		"target_type": "DATASET",
		"risk_level": "LOW",
		"confidence": 0.95,
	},
	"canonical": {
		"decision": "ALLOW",
		"policy_id": "policy-1",
		"policy_version_id": "version-7",
		"authority_status": "APPROVED",
		"execution_mode": "AUTO",
		"reversible": true,
	},
}

test_preserves_canonical_decision if {
	result := decision with input as valid_input
	result.decision == "ALLOW"
	result.policy_version_id == "version-7"
}

test_preserves_approval_requirement if {
	approval := object.union(valid_input, {"canonical": object.union(valid_input.canonical, {"decision": "REQUIRE_APPROVAL"})})
	result := decision with input as approval
	result.decision == "REQUIRE_APPROVAL"
}

test_rejects_unapproved_authority if {
	unapproved := object.union(valid_input, {"canonical": object.union(valid_input.canonical, {"authority_status": "DRAFT"})})
	not decision with input as unapproved
}

test_rejects_missing_policy_version if {
	missing_version := object.union(valid_input, {"canonical": object.remove(valid_input.canonical, {"policy_version_id"})})
	not decision with input as missing_version
}
