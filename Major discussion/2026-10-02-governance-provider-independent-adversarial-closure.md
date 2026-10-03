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
| Checkpoint claim used read then upsert and could race concurrent workers | High | Atomic database claim added and initial insert race hardened with conflict-safe lookup; concurrency/fencing validation remains mandatory |
| Desired-state JSON validation relied too heavily on TypeScript shapes | High | Deep runtime validation added; fuzz/negative coverage required |
| Latest exact head has not yet completed the full CI matrix | High release gate | Must be green before closure |
| Branch can move behind main during long implementation | Medium | Exact-head sync/freeze required at closure |
| Informatica live endpoint conformance is not proven without tenant credentials | High activation gate | Keep mutation support disabled; run read-only conformance when credentials are available |
| Official MCP SDK interoperability is not yet proven end-to-end | Medium | Mandatory post-implementation interoperability gate |
| Provider projections are normalized but not yet treated as a durable source-of-truth mapping | Medium | Addressed on PR branch with project/provider/connection-scoped durable projection persistence; isolated migration replay and collision tests remain required before closure |
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

## Takeover adversarial findings — 2026-10-03

| Finding | Severity | Disposition |
| --- | --- | --- |
| Public plan API accepted caller-supplied observed provider state, allowing forged actual-state planning | High | Fixed. The route now delegates only to authoritative runtime discovery. |
| Desired-state deep validation was not guaranteed at the shared apply runtime boundary before authorization/discovery | High | Fixed. Shared runtime validates before apply authorization and provider discovery. |
| Ambiguous non-atomic RUNNING/PENDING resume could replay provider mutation | High | Fixed. Generic resume now fails closed; durable RPC retains stale-worker reclaim only through fenced generation. |
| FAILED checkpoint could automatically re-enter execution without retryability evidence | High | Fixed. FAILED is terminal for automatic resume; retryable exceptions remain owned by the bounded execution retry layer. |
| Same-host browser Origin on a different scheme/port could pass MCP transport validation | Medium | Fixed. Origin authority must now match request scheme, host and effective port. |
| Informatica timeout normalization existed without an actual client timeout | Medium | Fixed. Bounded AbortSignal timeout added and covered by tests. |
| DELETE dependency ordering could remove a referenced object before its dependent/update | High | Fixed. Delete dependencies use observed inbound relationships and contradictory explicit absence is rejected. |
| Governance-provider post-implementation requirements were documented but not represented by a dedicated CI workflow | High release gate | Fixed. Added Governance Provider Assurance workflow plus independent adversarial script. |
| Provider projections are not durable source-of-truth mappings | Medium activation limitation | Explicitly accepted for the read-only foundation. Mutation enablement remains blocked until durable projection/provider-object binding is designed, migrated, and conformance-tested. |
| Informatica live endpoint conformance | High activation gate | External credential boundary remains. Mutations stay disabled. |
| Production Supabase migration application | Controlled activation boundary | No production migration is applied by this PR takeover. |

The exact-head closure audit must still re-run after the implementation head is frozen. Any subsequent code fix invalidates earlier exact-head evidence and requires the affected gates to run again.


## Final pre-freeze adversarial disposition

| Finding | Severity | Final code-level disposition |
| --- | --- | --- |
| Explicit delete could miss an unmanaged inbound dependent because discovery was scoped to desired keys | High | Fixed. Any explicit delete requests broad provider discovery and planning blocks unresolved unmanaged inbound references. |
| Stale RUNNING reclaim could replay a provider mutation after an ambiguous crash window | High | Fixed. Stale reclaim returns RECOVER, increments the fence generation, performs readback and never automatically replays unresolved work. |
| PARTIAL provider mutation could execute without explicit semantic-loss consent | High | Fixed fail-closed. PARTIAL mutation is non-executable until an explicit semantic-loss acceptance contract exists. |
| Mutation capability with idempotency NONE could enter automatic retry/execution | High | Fixed fail-closed. Non-idempotent mutation capability is non-executable. |
| Persistence invariants were previously proven primarily by static SQL contracts | High release gate | Fixed in assurance design. Isolated Supabase behavioral fixture now exercises claim/recovery/fencing/evidence immutability. |
| Provider Golden Path was not explicit in the provider-specific assurance workflow | Medium release gate | Fixed. Added governed provider Golden Path and upstream Golden Path handoff execution. |
| Official MCP 2026-07-28 SDK/conformance interoperability | Medium closure gate | Awaiting authenticated test identity/runtime execution. Authentication remains mandatory. |
| Informatica live conformance and mutation activation | High activation gate | External credential/activation boundary. Mutations remain disabled. |
| Durable provider projection source-of-truth mapping | Medium activation limitation | Still intentionally deferred and blocks mutation activation where provider-object identity persistence is required. |

No source-review result overrides exact-head CI, behavioral migration validation, authenticated MCP interoperability, or live Informatica conformance evidence.
