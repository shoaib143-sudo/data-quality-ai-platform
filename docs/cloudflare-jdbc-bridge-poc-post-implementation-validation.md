# Cloudflare JDBC Bridge PoC — Post-Implementation Validation

## Scope

Repository-only proof-of-fit for the generic Java JDBC bridge on Cloudflare Containers. This evidence does not authorize paid activation or production cutover.

## Revalidation matrix

- Existing Java 21 bridge image: reused unchanged.
- Existing Maven/unit suite: required by JDBC Bridge CI.
- Cloudflare static contract: required.
- Negative/failure-path suite: required.
- Independent adversarial audit: required.
- Docker image build: required.
- Wrangler bundle validation: required with `deploy --dry-run`.
- Production `JDBC_BRIDGE_URL`: unchanged.
- Existing Render runtime: retained as fallback.
- Live cold-start and public JDBC connectivity: pending explicit Workers Paid approval.
- Private/VPC/static-egress enterprise database connectivity: not certified by repository validation.

## Negative and failure cases

- Execution kill switch defaults to false.
- Missing bridge token fails closed before container execution.
- Wrong bearer token fails closed.
- Non-POST protected requests fail.
- Unknown routes fail without container forwarding.
- SSH remains disabled.
- No Supabase service-role, R2, or raw database username/password authority is introduced.
- Existing bridge authentication remains active inside the container for defense in depth.

## Independent adversarial audit

The audit independently checks route exposure, kill-switch state, secret boundaries, non-root runtime, Infisical default authority, paid-activation wording, and explicit non-certification of private/static-egress networking.

## Live completion boundary

The PoC remains incomplete until the owner explicitly approves Workers Paid activation and a live canary demonstrates cold/warm readiness, authenticated public JDBC connectivity, runtime logs, and rollback behavior.
