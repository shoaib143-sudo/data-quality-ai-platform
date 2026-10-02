# Independent Adversarial Closure: Multi-Platform Governance Provider

Date: 2026-10-02
Decision status: Planned, mandatory after implementation completion.

## Closure question

Can DataNexus expose provider-neutral governance planning and execution without creating a second authorization/policy/runtime stack, without allowing provider or MCP paths to bypass governance, and with deterministic recovery/evidence under failure and concurrency?

## Independent audit method

The audit starts from the exact PR diff, public interfaces, database migrations and observable behavior. It does not assume implementation intent is correct. The audit attacks trust boundaries first: API/MCP input, principal/project binding, PDP/approval, idempotency/concurrency, provider translation, verification/readback, persistence and evidence immutability.

## Current gap register from pre-closure review

| Gap | Severity | Current disposition |
| --- | --- | --- |
| Evidence store referenced deployment_id absent from original migration | High | Fixed with forward migration; clean-install and upgrade tests required |
| Checkpoint claim used read then upsert and could race concurrent workers | High | Atomic database claim added; concurrency/fencing validation remains mandatory |
| Desired-state JSON validation relied too heavily on TypeScript shapes | High | Deep runtime validation added; fuzz/negative coverage required |
| Latest exact head has not yet completed the full CI matrix | High release gate | Must be green before closure |
| Branch can move behind main during long implementation | Medium | Exact-head sync/freeze required at closure |
| Informatica live endpoint conformance is not proven without tenant credentials | High activation gate | Keep mutation support disabled; run read-only conformance when credentials are available |
| Official MCP SDK interoperability is not yet proven end-to-end | Medium | Mandatory post-implementation interoperability gate |
| Provider projections are normalized but not yet treated as a durable source-of-truth mapping | Medium | Validate whether durable projection persistence is required before mutation activation |
| Stale RUNNING checkpoint reclaim needs fencing proof against a late original worker | High | Adversarial concurrency test required; live mutation activation blocked until proven |
| Production Supabase migration has not been applied | Controlled activation boundary | Apply only through approved infrastructure change after isolated validation |

## Adversarial invariants

A successful audit must demonstrate:
- no mutation before deployment-wide preflight completes;
- no provider call after RBAC denial, PAUSE/KILL, PDP DENY or unresolved approval;
- approval is bound to immutable execution intent and cannot authorize changed desired state;
- explicit absence is the only delete request;
- concurrent/replayed calls cannot cause duplicate mutation;
- success without verification is not terminal completion;
- drift is observable after deployment;
- provider-specific IDs/auth/pagination never leak into canonical policy semantics;
- evidence is append-only;
- MCP is a facade over the same DataNexus control plane, never a privileged side door.

## Evidence package

The final closure report will include exact head SHA, main SHA, workflow/check results, test counts, migration validation, adversarial findings and resolutions, provider conformance result, MCP interoperability result, residual risks and activation boundaries.

No production-readiness statement should be issued from source review alone.
