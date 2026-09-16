# Governance Policy Correctness

## Required automated coverage

Test policy applicability, precedence, inheritance, overrides, conflicts, versioning, activation/deactivation, expiry, scope, project/domain boundaries, risk thresholds, authority changes, and policy changes during pending/running workflows.

## Conflict testing

Generate combinations of allow/deny, global/project/domain policies, explicit overrides, and competing controls. Expected precedence must be deterministic and machine asserted.

## Temporal correctness

A previously valid decision must be revalidated when policy, authority, target, fingerprint, or other governed precondition changes where product rules require it. Stale approvals must not silently authorize changed execution.
