# Learning Promotion Approval Authority Contract

Date: 2026-10-01

## Decision

`PROMOTE_LEARNING_CANDIDATE` is already defined by Agent Policy v2 as an `agent.admin` project action with HIGH financial/production impact, a material production mutation, and reversible rollback semantics. In production this remains subject to the existing dual-axis Business + Governance approval policy.

A contract mismatch remained in the direct approval-authority assignment migration: the action catalog recognized `PROMOTE_LEARNING_CANDIDATE`, but the database allowlist used by `governance.assign_agent_approval_authority` predated that action and rejected any explicit assignment.

The forward migration `20261001090000_learning_promotion_approval_authority_action.sql` reconciles that mismatch.

## Security invariants preserved

- No user receives promotion authority from this migration.
- The historical `action_keys` column default is unchanged and still does not include learning promotion.
- Promotion authority must be explicitly selected by the governed admin assignment path.
- The assigning administrator cannot assign direct authority to themselves.
- One person cannot simultaneously hold overlapping Business and Governance authority for the same project/domain.
- Project scope, organization membership, governed-domain validation, action/risk ceiling, time bounds, concurrency locking and audit evidence remain required.
- Assignment authority does not imply execution authority, release approval, canary activation, or candidate promotion.
- Existing candidate release approval continues to require an independently verified positive prospective evaluation and current authorization.

## Live activation boundary

The live DataNexus inventory observed before this repair contained no authority row whose `action_keys` included `PROMOTE_LEARNING_CANDIDATE`. This migration deliberately does not create one.

Selecting the actual Business and Governance approvers is an operational/business-policy decision and remains outside autonomous implementation. Until explicit authorities are assigned through the governed admin path, promotion approval remains fail-closed.

## Verification

Required evidence on the implementation PR:

1. forward-only migration enforcement;
2. static contract test proving catalog/action alignment;
3. negative assertions proving no implicit/default authority grant;
4. existing direct-authority separation-of-duties and assignment controls unchanged;
5. Continuous Learning Governance and Repository/Release Governance green on one exact head;
6. database migration reconstruction green.

No production migration deployment or authority assignment is authorized by this record.
