# Learning agent artifact storage contract

Date: 2026-10-03  
Scope: implementation-ready contract for immutable baseline/candidate executables and replayable evaluation inputs. This is design documentation only. No schema was changed, no artifact data was fabricated, no provider was called, and no production service was accessed.

## Audit finding

The repository has generic project-scoped object storage, but not a canonical immutable source for learning-runner executables or benchmark input bytes.

| Existing source | What it provides | Why it is insufficient |
| --- | --- | --- |
| `agent.learning_candidates` in `supabase/migrations/20260920010000_governed_learning_candidates.sql` | Agent/skill, baseline and candidate version labels, descriptive `proposed_change`, evidence references | No executable bytes, immutable object identity, content digest, or executable bundle binding |
| `agent.learning_benchmark_dataset_cases` in `supabase/migrations/20260929000300_learning_benchmark_dataset_manifest.sql` | Immutable case key, split, and opaque `source_case_ref` | No verified, retrievable case input bytes or input digest binding |
| `agent.agent_definitions` and `agent.agent_version_lifecycle` | Prompt/configuration registry and lifecycle labels | Lifecycle evidence does not snapshot or hash prompt/configuration/tool contracts; mutable registry rows are not artifact snapshots |
| `orchestration.object_artifacts` and `SupabaseObjectStore` | Project-scoped object storage and lifecycle tracking | Generic `put` upserts; lifecycle rows do not bind candidate/version/case roles or attest content hashes |
| `lib/agents/learning-experiment-runner.ts` | Runner requires `{ref, hash, bytes}` and verifies SHA-256 | The server plan loader and stored-plan verifier are injected ports; no canonical resolver is wired |

Do not turn `proposed_change` or an opaque case reference into executable content. Resolver implementation must wait for a canonical immutable manifest and writer contract.

## Required storage model

Add an append-only manifest that binds owner identity and role to exact stored bytes. Keep this as a proposed schema until separately reviewed and tested in a disposable database with the required `agent`, `governance`, and `orchestration` dependencies.

Suggested `agent.learning_artifact_manifests` fields:

- `id`, `project_id`, `artifact_kind`, `artifact_role`, and `created_at`.
- Executable owner fields: `agent_key`, `agent_definition_id`, `agent_version`, and optional `candidate_id`. Roles are `BASELINE` or `CANDIDATE`.
- Replay input owner fields: `dataset_manifest_id`, `case_key`, `dataset_version_id`. Role is `HELD_OUT_INPUT`.
- Object locator fields: `provider_key`, `bucket`, normalized project-scoped `object_key`, `content_type`, `size_bytes`, and `sha256`.
- Provenance fields: server-owned source record, actor/service identity, creation timestamp, and schema/serialization version.

Constraints and invariants:

1. Exactly one immutable binding for each project, owner identity, version/case, and role. Enforce unique constraints and foreign keys to canonical owner records.
2. Deny update and delete to all runtime roles. Corrections create a new candidate version or dataset manifest; they never rebind an existing identity.
3. Store bytes under a private bucket and server-derived project namespace. Use opaque IDs or content-addressed keys. Reject traversal, external URLs, signed URLs as durable references, and caller-selected cross-project object paths.
4. Write with create-only semantics. If an object key already exists, verify its bytes and digest match exactly or fail. Do not rely on the current upsert behavior for immutable artifacts.
5. Compute SHA-256 and byte length server-side from the exact bytes written. Persist digest and size in the manifest. Resolver recomputes both after retrieval.
6. For executable bundles, hash a canonical serialization containing the prompt, configuration, skill and tool contract references with exact versions, runtime adapter/version, policy contract version, and serialization format. No executable component may float to `latest`.
7. For benchmark input, the immutable sealed manifest must bind each held-out `case_key` to its artifact ID and digest. Resolver independently confirms `HELD_OUT`, project, dataset manifest, and dataset-version membership.
8. Keep artifact lifecycle and retention compatible with reproducibility. An artifact required by an evaluation cannot be deleted or expired while any policy, run, or audit record references it. Use legal hold or retention derivation from the owning evidence policy.
9. Keep synthetic fixture artifacts in a separate namespace/store and mark provenance explicitly. Synthetic bytes and outcomes must never enter prospective evidence or release admission.

## Server API contract

Implement these operations only after the manifest and write contract are in place:

| Operation | Required behavior |
| --- | --- |
| `stageLearningArtifact` | Accept bytes only on a server path; validate size/type; derive scope and storage key; compute SHA-256; write create-only; verify readback; append manifest binding atomically. On partial failure, leave no resolvable manifest and record/clean up the orphan safely. |
| `resolveAgentExecutable` | Input: project, agent key, exact version, expected definition/candidate identity, role, expected digest. Return runner artifact only after manifest, lifecycle, ownership, object lifecycle, byte length, and recomputed digest all match. Reject baseline/candidate aliasing. |
| `resolveHeldOutInput` | Input: project, dataset manifest, case key, dataset version, expected digest. Confirm sealed manifest membership and `HELD_OUT`, then retrieve and verify exact bytes. Never resolve training examples through this interface. |
| `buildVerifiedPlan` | Load policy/candidate/manifest from canonical records; resolve both executable artifacts and all held-out inputs; derive the runner execution manifest hash from canonical ordered identities and hashes. Do not accept route-supplied bytes or hash assertions as authority. |

All read/write APIs must fail closed on missing, ambiguous, stale, cross-project, inactive/deleted, malformed, or mismatched evidence. Do not expose artifact bytes or service credentials through browser routes or logs. Durable references are opaque manifest IDs, not public or signed URLs.

## Access control and lifecycle

- Private object bucket. Browser roles receive no direct object or manifest access by default.
- Manifest RLS enabled with explicit deny for `anon` and `authenticated`; narrowly grant service-role operations needed by server adapters. Prefer security-definer RPCs with fixed search paths for atomic registration where table-level privileges are not required.
- Enforce project equality in every lookup and foreign key. Never trust project identity read only from a caller payload.
- Artifact writer is limited to authorized server services and must verify current actor/project/agent/mode authority before registering a new candidate artifact. Reads also check project, owner, version, role, and lifecycle.
- Avoid secret-bearing data in artifacts. Redact provider credentials and sensitive source data before persistence. Record content type, size, digest, and provenance, not raw bytes, in logs.
- Ensure retention cannot remove referenced bytes. Make lifecycle transitions auditable and deny resolution for `DELETING`, `DELETED`, or `FAILED` objects.

## Negative, failure, and adversarial tests

1. Valid in-scope executable and held-out input resolve; exact bytes reproduce the registered SHA-256 and size.
2. One-byte tamper, truncated download, wrong declared size/hash, malformed digest, unsupported digest algorithm, missing bytes, and corrupt serialization all fail before dispatch.
3. Cross-project ID, wrong agent/definition/version/candidate, role confusion, wrong policy/run, wrong manifest/case/dataset-version, duplicate or ambiguous row, and baseline/candidate aliasing fail closed.
4. Training case, absent case, modified split, changed source snapshot, changed sealed manifest, duplicate case key, and held-out input from another dataset version fail closed.
5. Existing object key overwrite, manifest rebind, update/delete, duplicate registration, and stale object lifecycle state are rejected. New content requires a new version/manifest identity.
6. Storage timeout, database read failure, download error, partial upload, registration failure, readback failure, object-not-found, retention expiry, and digest computation exception create no runner claim and no provider call.
7. Concurrent writers cannot publish a partial or conflicting artifact. Concurrent resolvers see either a complete valid manifest/object pair or fail closed.
8. Direct browser access to manifest rows, object bytes, and write RPCs is denied. Cross-tenant error responses do not reveal object existence.
9. Verify all eight governed agent keys and every supported mode resolve the pinned artifact with unchanged tool allowlist and mutation boundary.
10. Altering any prompt/config/tool/runtime/policy component, case bytes, scope ID, role, or ordered input list changes the execution manifest digest.
11. Synthetic artifact, score, accounting, and provenance cannot pass prospective plan validation or enter the live outcome/release path.
12. A failure after object write but before manifest registration leaves an unresolvable orphan that is safely reconciled without overwriting a valid artifact.

## Integration and exit checklist

- [ ] Review proposed schema and grants against current migration conventions and artifact retention policy.
- [ ] Implement create-only writer, canonical registry binding, and readback verification.
- [ ] Add resolver unit tests with in-memory object/database ports, including all failure cases above.
- [ ] Test exact migrations, RLS, grants, immutability, transaction atomicity, foreign keys, and concurrency in a disposable PostgreSQL/PGlite database with complete dependencies.
- [ ] Use the agreed `testing` schema only for synthetic fixture metadata. It is not a clone of `agent` or `governance`, and an unchanged migration targeting those schemas is not isolated by applying it to `testing`.
- [ ] Wire the verified resolver into the server plan loader; remove any production use of unconstrained caller-supplied `loadServerPlan` or `verifyStoredPlan` adapters.
- [ ] Independently audit cross-tenant isolation, artifact tampering, lifecycle/retention races, replay isolation, and no-dispatch guarantees on the exact integration commit.
- [ ] Keep live provider dispatch and candidate promotion disabled until authority, held-out replay, quote/budget, independent evaluation, confirmation, and prospective evidence gates are separately complete.

## Source paths reviewed

- `supabase/migrations/20260920010000_governed_learning_candidates.sql`
- `supabase/migrations/20260929000300_learning_benchmark_dataset_manifest.sql`
- `supabase/migrations/20260919123000_agent_version_lifecycle.sql`
- `supabase/migrations/20260904185342_object_artifact_lifecycle_registry.sql`
- `lib/data-plane/providers/supabase-object-store.ts`
- `lib/agents/learning-experiment-runner.ts`
- `lib/agents/learning-experiment-runner-service.ts`
- `Admin/learning-experiment-runner-implementation-20261001.md`
- `Admin/learning-experiment-runner-post-merge-revalidation-20261003.md`
