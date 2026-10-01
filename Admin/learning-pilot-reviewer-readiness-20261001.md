# Learning pilot reviewer readiness

Checked read-only on 2026-10-01 at 14:41 UTC (22:41 Singapore). Scope: Profiling Demo Project (`479813aa-72a4-4b12-b72a-74da8d2419ce`), Supabase project `tvjnavjxuehpesxcfvrx`.

No role, membership, identity, candidate, evaluation policy, or result was created or changed. No paid invocation occurred. This document records eligibility evidence, not a reviewer assignment or independence attestation.

| Check | Observed result | Meaning |
|---|---|---|
| Canonical organization | Exactly 1 organization; pilot belongs to it | Instance organization invariant satisfied at inspection |
| Active, unexpired organization-wide Data Governance Admin approvers | 2 distinct users | Current `DATA_GOVERNANCE_ADMIN` role includes `policy.approve` |
| Membership | Both have canonical instance membership | Membership prerequisite satisfied at inspection |
| Auth lifecycle | Both users are not deleted and not currently banned | Does not establish authenticated session or human availability |
| Direct policy-approver bindings on pilot | 0 | Organization-wide authority is material; direct-binding-only counts understate eligibility |
| Server-marked test principal/persona | 1 of the 2 | `auth.users.raw_app_meta_data.datanexus_test_principal = true`; server metadata also contains `persona_slug` |
| Other approver | 1 not carrying those markers | Absence of a test marker does not prove a real independent human |
| Registered pilot candidates / locked policies | 0 / 0 | No canonical proposer/evaluator assignment exists to compare |
| Organizational independence | Unverified | No attestation about candidate involvement, reporting conflicts, or evaluator independence was inferred |

## Canonical authority path

`lib/auth/authorize.ts` checks the project capability RPC and then the organization-wide Data Governance Admin path. That path requires the role to include the requested capability and an active, unexpired admin binding on any project in the same organization. `authorizeProject` also resolves canonical instance membership through `lib/governance/instance-organization.ts`. An admin binding on a different project in this organization can therefore authorize `policy.approve` for this pilot. Recheck the same server path immediately before a governed action; this inspection is a point-in-time snapshot.

The aggregate queries joined `app.projects`, `governance.project_role_bindings`, `governance.access_roles`, `app.organization_members`, and relevant auth lifecycle fields. No email, display name, credential, token, or full metadata payload was collected for this document. Test-account classification used server-owned `raw_app_meta_data`, not editable user metadata. A test persona can exercise synthetic authorization flows under existing permission; it must not be presented as evidence that an independent human reviewed a real improvement.

## Independence remains a separate requirement

The locked evaluation policy records `evaluator_actor_id` and `proposer_actor_id` and rejects equal values. Distinct IDs prove only syntactic separation. They do not establish who developed the candidate, whether the evaluator was involved in selecting successful cases, or whether two identities are controlled by one person. Neither eligibility nor the existence of an unmarked account is an independence attestation.

Before a real evaluation, bind an actual proposer and evaluator to the canonical candidate and policy. Verify the evaluator's applicable authority, exclude candidate-authoring involvement and conflicts, and record the independent evidence review. Do not invent actor identifiers, use a second persona to claim independent human review, or mark results `independentlyVerified` solely because IDs differ. Keep candidate release blocked until the evidence requirements are met.

## Capability disposition

| Capability | Status | Disposition | Evidence required next |
|---|---|---|---|
| Native project and organization reviewer authorization | PARITY | KEEP | Fresh authenticated capability check for the actor performing the governed action |
| Distinct proposer/evaluator actor bindings | PARTIAL | KEEP | Real canonical candidate/policy assignment, then identity and conflict verification |
| Human organizational independence | GAP_REQUIRED | BUILD_NOW | Specific independent review and attestation before any real improvement claim |
| Test-persona eligibility for synthetic verification | PARITY | KEEP | Preserve explicit synthetic classification; no promotion to real evidence |

No ADR-007 agent classification or DataNexus authority boundary changes. This readiness check does not activate agents, approve a candidate, or establish model/provider readiness.
