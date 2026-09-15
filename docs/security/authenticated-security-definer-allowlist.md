# Authenticated SECURITY DEFINER allowlist

## Purpose

DataNexus intentionally retains a very small set of authenticated-callable `SECURITY DEFINER` functions where RLS recursion avoidance or governed human action requires privileged database execution. These functions are not generic privilege escalation endpoints. Their access model is fail closed and machine verified.

## Approved application-schema allowlist

The approved authenticated-callable set is limited to:

1. `app_private.is_org_admin(uuid)`
2. `app_private.is_org_member(uuid)`
3. `app_private.is_project_admin(uuid)`
4. `app_private.is_project_member(uuid)`
5. `agent.resolve_runtime_interrupt(uuid, text, text, jsonb)`
6. `orchestration.request_execution_recovery_action_admin(uuid, text)`

The four `app_private` helpers exist solely to evaluate membership and administration predicates without recursive RLS evaluation. `app_private` is not in the configured PostgREST schema list. Anonymous execution is revoked and all four functions use an empty search path.

`agent.resolve_runtime_interrupt` is intentionally authenticated-callable because it is the governed human approval boundary for a pending runtime interrupt. It requires `auth.uid()`, project-admin authority before row locking, a pending interrupt, an unexpired approval window, and matching action payload identity before state mutation. Anonymous execution is revoked and its search path is empty.

`orchestration.request_execution_recovery_action_admin` is already governed by the production security posture contract and remains the second intentionally authenticated privileged RPC.

## Verification

`governance.verify_authenticated_security_definer_allowlist()` fails closed unless:

* `app_private` remains outside the PostgREST exposed schema set.
* all four RLS helpers exist as `SECURITY DEFINER`, remain authenticated-callable, remain anonymous-inaccessible, and retain an empty search path.
* the runtime interrupt resolver remains authenticated-callable, anonymous-inaccessible, and retains its authentication, project-admin, locking, payload-binding, and expiry guards.
* no additional authenticated-callable `SECURITY DEFINER` function appears in DataNexus application schemas outside the six-function allowlist.

The verifier itself is executable only by `service_role`.

## Supabase advisor interpretation

The Supabase security advisor may continue to report the five functions above because its lint intentionally flags authenticated-callable `SECURITY DEFINER` functions for review. DataNexus treats those warnings as reviewed controlled exceptions only while the database verifier remains valid. A new or altered privileged function is not covered by this acceptance and must fail certification until separately reviewed.

Leaked-password protection is a separate Supabase Auth account configuration control and is not part of this database allowlist.
