# Vercel JDBC Bridge PoC — Post-Implementation Validation

## Scope

This evidence file covers the non-production Vercel proof-of-fit only. It does not authorize changing production JDBC_BRIDGE_URL or removing the existing fallback runtime.

## Revalidation matrix

- Static packaging contract: implemented and CI-enforced.
- Java 21 / Spring Boot compatibility: existing bridge retained; Maven suite required.
- Standard Docker image build: required.
- Dockerfile.vercel image build: required.
- Response-size guard: unit-tested against a payload larger than the Vercel transport ceiling.
- Credential-in-URL rejection: existing negative tests retained.
- Read-only JDBC connection behavior: existing tests retained.
- Missing bridge authentication: fail-closed behavior retained.
- Automatic Vercel Git deployment: disabled by project-local vercel.json and checked independently.
- Live PoC probe: manual workflow-dispatch only.
- Cold-start <= 5 seconds: requires a deployed PoC and genuine idle/cold evidence.
- Public PostgreSQL plus one second JDBC engine: requires deployed PoC test targets.
- Private/VPC/allowlisted enterprise networking: explicitly not certified by this PoC.

## Independent adversarial audit

The independent audit checks non-root execution, no baked secrets, fail-closed bridge authentication, read-only connection enforcement, embedded-credential rejection, response-budget enforcement, manual-only live probing, no CI deployment command, and explicit networking/cutover boundaries.

## Negative and failure cases

- Missing PoC URL causes the live probe to fail before doing work.
- Invalid health budget is rejected before network access.
- Protected API without a bearer token must return 401.
- Missing configured bridge token must return 503.
- JDBC URLs containing credentials remain rejected.
- Unsafe identifiers remain rejected.
- Oversized query responses are truncated before the transport budget and emit an explicit warning.
- CI cannot deploy Vercel automatically.

## Completion boundary

Static/unit/container certification may be completed entirely in CI. The PoC remains incomplete until an isolated Vercel project is deployed manually, cold-start evidence is collected, and at least two public JDBC engines pass catalog/validate/query checks.
