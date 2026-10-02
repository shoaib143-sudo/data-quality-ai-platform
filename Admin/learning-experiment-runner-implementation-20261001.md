# Learning experiment runner implementation checkpoint

Date: 2026-10-01. Scope: native implementation and disposable zero-spend verification. No real provider call, application release, positive live evaluation or automatic promotion is authorized by this module.

## Completion boundary

The runner module must bind a server-loaded plan to immutable executable artifacts and held-out input bytes, preserve a durable case/arm dispatch identity, stop on ambiguous re-entry, and collect complete canonical paired evidence. Dependency-injected ports are integration boundaries, not proof that live authority, dataset replay or provider pricing is configured.

The existing logical policy key and the persisted policy record UUID are different identifiers. Budget reservations and runner database references must use the record UUID. Artifact references, labels or catalog checksums alone are insufficient without verified bytes.

## Implemented module

| File | Behavior |
| --- | --- |
| `lib/agents/learning-experiment-runner.ts` | Default preparation, sealed artifacts/replay inputs, separate record UUID, training exclusion, per-arm claims, immutable outcomes, canonical verification port and conservative resume/cancellation. |
| `lib/agents/learning-experiment-runner-invocation.ts` | Supported prompt artifacts invoke the existing quote/budget guard after explicit activation; capture accounting and reload exact settlement scope. Synthetic provider dispatch is rejected. |
| `lib/agents/learning-experiment-runner-store.ts` | Live-only service adapter for immutable claim/completion RPCs; synthetic stores stay isolated. |
| `lib/agents/learning-experiment-runner-service.ts` | Server composition and canonical reservation/ACCOUNTED settlement/PRICED USD cost-event loader; joins exact project, invocation and run identity and rejects missing, ambiguous or inconsistent accounting. Concrete immutable-plan and current-authority adapters remain required. |
| `lib/agents/learning-experiment-runner-scoring.ts` | Complete paired score/accounting linkage and bounded Hoeffding recomputation; confirmation remains false and prospective writes disabled. |
| `supabase/migrations/20261001152250_learning_experiment_runner_evidence.sql` | Immutable live claim/outcome schema, held-out case binding, output-byte digest and actual ACCOUNTED settlement/PRICED cost-event checks. Source migration presence does not imply deployment. |

Independent local rerun of `node --experimental-strip-types scripts/test-learning-experiment-runner.mjs` passed 119 scenarios across the core, scoring and invocation boundaries. These are disposable fixture records, not live improvement evidence. The SQL behavior fixture passed in disposable PGlite; native PostgreSQL session contention was separately exercised by the PostgreSQL 16 CI fixture. Both the ten-session claim fixture and exact-head repository CI passed for source checkpoint `140e31de8a629cdf0f76698f2ac60bc4e446f85e`. Service-specific verification is tracked separately from the 119-scenario runner count. See the post-implementation record for current reruns.

## Essential verification

| Gate | Required evidence |
| --- | --- |
| Input integrity | Exact executable and input bytes reproduce locked hashes; wrong project, version, arm, dataset and manifest rejected. |
| Authority | Current native project/agent/mode execution authorization and independent evaluator authority resolved by trusted server adapters; caller booleans are not proof. |
| Dispatch | Immutable atomic claim exists before side effects; competing callers and ambiguous prior attempts cannot invoke a second call. |
| Cancellation | Before dispatch cancels without provider invocation; after dispatch retains known or unknown accounting and prevents silent retries. |
| Accounting | Each arm resolves the actual invocation, reservation, settlement and canonical cost event; missing or mismatched scope stops collection. |
| Evaluation | Scores derive from persisted outputs and calibrated evaluator artifacts; full sample denominator retained and confirmation evidence cannot be fabricated. |
| Segregation | Synthetic fixture outcomes never enter the existing ledger that writes `synthetic: 'false'`; no synthetic positive release result. |
| Review | Positive native outcomes still require the existing release approval, controlled canary and rollback path. |

## Remaining activation requirements

The migration and server composition exist in source only at this checkpoint. No live runner-schema deployment or joined application entrypoint is evidenced. First prospective execution still requires a concrete canonical plan loader and integrity verifier, current native authority resolution, replayable source bytes and sealed independent cases, concrete executable baseline/candidate artifacts, actual evaluator independence, a verified provider/pricing adapter, an approved spending bound and joined production invocation. The existing Vercel/Cloudflare live parity hold remains effective. No source remediation or ADR-007 reclassification follows from the runner module.

Implementation and verification findings are recorded in [the independent review](../Major%20discussion/learning-experiment-runner-review-20261001.md).

The direct server-service behavior suite also passed for canonical scope/currency/usage, missing or failed reads, and activation denials. Preparation and missing activation dependencies produced zero dispatch claims and zero provider calls in disposable fixtures. The final local production build passed. The [post-implementation plan and results](learning-experiment-runner-post-implementation-20261002.md) records exact-head CI, reruns and the adversarial case matrix.
