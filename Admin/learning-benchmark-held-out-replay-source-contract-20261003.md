# Held-out benchmark replay source contract

Date: 2026-10-03  
Status: implementation-ready integration contract; no runtime implementation or live database change in this document.

## Purpose and activation boundary

The learning experiment runner must give both arms the exact same held-out input bytes, loaded from a trusted server-side source, before either arm is dispatched. A manifest reference, object key, catalog hash, or caller-supplied digest alone is not proof that those bytes are available or unchanged.

This contract closes the replay input boundary only. It does not authorize a model call, provide candidate executable artifacts, prove current execution authority, establish evaluator independence, price an invocation, or authorize promotion. Prospective execution remains disabled until those separate integrations pass their own gates.

## Current repository evidence and exact gap

| Area | Existing behavior | Consequence |
| --- | --- | --- |
| Dataset manifest | `agent.learning_benchmark_dataset_cases` stores `dataset_id`, `project_id`, `case_key`, `split`, and nonempty `source_case_ref`. `agent.register_learning_benchmark_dataset` seals manifest membership and hashes sorted `case_key:split:source_case_ref` entries. | The digest covers assignments and references, not source bytes. The reference can be arbitrary opaque text. |
| Dispatch binding | `agent.learning_experiment_dispatch_claims` binds manifest ID, case key, arm, dataset version, artifact hash, execution-manifest hash, and input hash. It rejects non-held-out cases and immutable identity conflicts. | The SQL claim checks split membership but does not resolve `source_case_ref` to bytes. |
| Runner plan | `RunnerCase` carries `caseKey`, `datasetVersionId`, `split`, and `input: RunnerArtifact`. Runner validation checks input bytes against the supplied SHA-256 and includes the input reference/hash in its execution-manifest digest. | Integrity is checked after plan construction; a trustworthy production loader must source and verify the bytes before constructing the plan. |
| Supabase object store | `SupabaseObjectStore.get(scope,key)` reads project-scoped bytes. Its `put` uses `upsert: true`; its lifecycle registry records size but no verified SHA-256. | A key and project scope do not establish sealed content. |
| Generic storage adapter | `SupabaseStorageAdapter.getObject(reference)` downloads bytes. `StorageReference.checksum` is optional caller input and the adapter does not recompute it. | This is not a content-verifying immutable replay reader. |
| Dataset-version invariant | `catalog.enforce_dataset_version_storage_object_invariants` checks project match and `READY` state when an object is bound. | `READY` is a lifecycle state, not proof of an immutable, digest-verified evaluation case snapshot. |

Relevant files:

- `supabase/migrations/20260929000300_learning_benchmark_dataset_manifest.sql`
- `supabase/migrations/20261001152250_learning_experiment_runner_evidence.sql`
- `lib/agents/learning-experiment-runner.ts`
- `lib/agents/learning-experiment-runner-service.ts`
- `lib/data-plane/providers/supabase-object-store.ts`
- `lib/storage/supabase.ts`
- `lib/storage/contracts.ts`
- `supabase/migrations/20260917000500_enforce_dataset_version_storage_object_invariants.sql`

**Exact blocker:** there is no canonical project-scoped, immutable binding from a held-out case row to a stored replay payload plus a trusted expected content digest, and there is no reader that verifies the binding and digest on every read. The production plan loader cannot safely map opaque `source_case_ref` values to replay inputs today.

## Required source binding

Implement a dedicated sealed payload binding, or extend an authoritative immutable artifact registry to provide the equivalent guarantees. The logical record is one payload per `(project_id, dataset_manifest_id, case_key)` and contains:

| Field | Requirement |
| --- | --- |
| `project_id`, `dataset_manifest_id`, `case_key` | Composite foreign key to the exact manifest case. Registration must verify the case is `HELD_OUT` and the manifest is `SEALED`. |
| `source_snapshot_ref`, `dataset_version_id` | Exact approved snapshot and catalog version represented by the case. Never resolve a label such as `latest` during replay. |
| `artifact_id` or provider/bucket/object key | Server-owned object identity. The reference must be a registry identity, not a caller-provided URL or path. |
| `content_sha256` | Trusted lowercase SHA-256 over the exact stored bytes, with a documented `sha256:` prefix convention. Set only during trusted ingestion after hashing the bytes read from the uploaded object. |
| `byte_length`, `content_type`, `encoding` | Exact expected length and media/encoding. Require UTF-8 JSON for the current runner invocation contract. |
| `canonicalization_version` | Version of the payload construction and serialization contract used before storage. Retain the actual bytes and do not reconstruct from live source rows during a replay. |
| `privacy_classification`, `redaction_version` | Classification and transformation evidence showing the payload is permitted for the selected evaluator/provider. Only the minimum required case input may be sealed. |
| `sealed_at`, `evidence_cutoff_at`, `created_by` | Immutable provenance and cutoff evidence. A payload created after the manifest cutoff must be rejected. |

The relation must be insert-only after seal, reject update/delete, enforce uniqueness for the case binding, and use project-scoped foreign keys. It must not grant `anon` or `authenticated` access. Reads and registration must go through narrowly scoped server/service paths. Registration must not accept an arbitrary client-supplied digest as evidence: trusted ingestion computes the digest from bytes and verifies the stored copy before sealing the row.

Prefer a content-addressed object key to reduce accidental overwrite risk, but do not describe that alone as storage-level WORM. Storage administrator credentials may still mutate an object. The authoritative protection is the immutable expected digest plus per-read verification. Replacing an object with different bytes under the same key must cause replay to fail. Replacing it with byte-identical content is content-equivalent and remains detectable only as an operational object event if the provider exposes version history.

The existing `source_case_ref` can remain as an opaque provenance field, but must resolve to exactly one sealed payload binding. It must not be interpreted as a URL, SQL fragment, storage path from the caller, or arbitrary provider URI.

## Reader contract and placement

Add a server-only module such as `lib/agents/learning-benchmark-replay-source.ts` with injected repository and byte-store ports for unit testing. The production composition belongs in `lib/agents/learning-experiment-runner-service.ts` or the concrete canonical plan loader wired there. The module should expose a read operation equivalent to:

```ts
loadHeldOutReplayInput({
  projectId,
  datasetManifestId,
  caseKey,
  datasetVersionId,
}): Promise<{ ref: string; hash: `sha256:${string}`; bytes: string }>
```

The reader must perform these steps in order:

1. Validate identifier formats and require all scope fields. Reject empty values and unknown run modes before querying storage.
2. Load the exact manifest and case binding by project, manifest ID, case key, and dataset version. Require `SEALED`, `HELD_OUT`, exact project/version match, and evidence cutoff not earlier than the payload seal time. Require exactly one row; missing or duplicate results fail.
3. Resolve the artifact through the trusted registry. Require the registry project, bucket, object identity, lifecycle state, immutable binding ID, byte length, media type, and expected digest to match the sealed binding. Never accept a URL from the manifest or case input.
4. Read the object's raw bytes using the server-side provider adapter. Do not fall back to a new source version, a similarly named key, a cached stale copy, or live source rows if the object is missing.
5. Verify actual byte length and recompute SHA-256 over the raw bytes. Require exact digest equality before decoding. Treat provider metadata checksums as supplemental only, not as a replacement for local digest verification.
6. Decode strict UTF-8, reject invalid encoding, parse JSON, and validate the versioned replay-input schema. Preserve and return the exact verified UTF-8 bytes that were hashed; do not reserialize JSON before returning or computing the runner input hash.
7. Return a canonical opaque reference derived from the sealed binding ID and digest. Exclude raw object keys and sensitive payload fields from logs and ordinary telemetry.

Every failure throws a stable, non-sensitive error code and stops plan loading before the runner can create a dispatch claim or call a provider. Do not return a partial plan or substitute another case. The production loader then builds `RunnerArtifact` with these verified bytes and hash, and the existing runner independently checks the hash and includes the reference/hash in `executionManifestHash`.

## Privacy and access controls

- Build case payloads from the minimum fields required by the agent task. Do not store an entire source table or include credentials, access tokens, connection strings, secrets, unrelated rows, or unnecessary personal data.
- Apply documented redaction/minimization before payload sealing. Store the classification and redaction version with the binding; reject evaluator/provider combinations not approved for that classification.
- Enforce the same project scope in the manifest row, sealed binding, artifact registry and storage key. A mismatch is a hard failure even when bytes and digest happen to match.
- Keep the bucket private. Replay uses server credentials and direct byte reads. Never create a signed public URL, return storage credentials, or expose source bytes in logs, traces, errors, GitHub, or user-facing reports.
- Restrict database reads to the server role and object reads to the narrow bucket/path policy. Audit registration, reads, denial, digest failures and retention actions without recording payload bytes or sensitive object paths.
- Respect approved retention and deletion policy. If a referenced payload is deleted or expires, historical replay becomes unavailable and must be marked unavailable; do not silently fetch a newer source version.
- Keep synthetic fixtures clearly labeled and in the synthetic evidence lane. They must never be converted to prospective provenance by the replay reader.

## Determinism and staleness rules

For a given `(project, manifest, case, dataset version, sealed binding)`, every successful read returns byte-for-byte identical bytes and the same SHA-256. Case ordering is determined by the immutable manifest order contract, preferably ascending `case_key`; it must not depend on storage listing order, database incidental order, current source ordering, or current wall clock. The entire selected case set and all input digests must be sealed into the plan's execution manifest before either arm dispatches.

Treat these conditions as stale and stop rather than refresh:

- the source snapshot, dataset version, manifest status, evidence cutoff or privacy/redaction version differs from the sealed binding;
- the artifact registry points at a different object identity, project, provider, bucket, size, digest, content type or lifecycle state;
- the object is missing, deleted, not ready, or cannot be read;
- the byte digest, length, encoding, JSON shape or replay schema version differs;
- the payload has been withdrawn under retention/privacy governance;
- a case reference resolves to zero or multiple bindings.

A retry of a byte read may be allowed only for an explicitly classified transient storage transport failure before any dispatch claim exists. Retry the exact object identity, bounded by a small configured read limit. Any non-transient failure or repeated transient failure stops preparation. Once a provider dispatch claim exists, source replay failure does not authorize another attempt or claim; the existing ambiguity/recovery contract applies.

## Negative, failure and security tests

Add `scripts/test-learning-benchmark-replay-source.mjs` for adapter behavior and a disposable SQL fixture for relational constraints. Use in-memory/fake providers for unit tests. No live Supabase data, provider calls or production storage writes are needed.

| Test case | Expected result |
| --- | --- |
| Correct project, sealed manifest, held-out case, exact object bytes/hash | Returns exact bytes, stable opaque ref and digest. |
| Training case, unregistered case, wrong manifest or wrong dataset version | Reject before object read. |
| Missing, duplicate, unsealed, cross-project, or stale binding | Reject; no fallback lookup. |
| Caller-supplied URL, path traversal, alternate bucket or provider | Reject; reader only uses registry identity. |
| Object missing, deleted, quarantined, not ready, timeout or storage error | Fail closed with stable error; no provider call or dispatch claim. |
| Same object key now contains different bytes | Recomputed digest mismatch; reject. |
| Correct digest but mismatched byte length, media type or encoding | Reject. |
| Invalid UTF-8, malformed JSON, array/scalar payload, unknown schema version, missing required fields or extra disallowed secret fields | Reject during schema validation. |
| Manifest split or source reference changed after sealing | Database mutation denied; a tampered fixture is rejected by binding consistency. |
| Registry/manifest/case project IDs disagree | Reject before read or dispatch. |
| Source cutoff is newer than manifest evidence cutoff | Reject as stale. |
| Transient fetch fails once then exact-key retry succeeds before claim | Success only if retry policy allows it; digest still verified. |
| Repeated transient error or retry returns different bytes | Stop; no provider dispatch. |
| Replay invoked twice for same sealed identity | Same bytes/hash/ref; no new source version selected. |
| Two cases have identical input digest when policy requires case independence | Reject duplicate case input before dispatch, consistent with runner validation. |
| Storage response or database exception includes secret/object payload | Error exposed to caller is sanitized; no sensitive values in logs. |
| Attempt to update/delete sealed payload binding or referenced manifest case | Database rejects mutation. |
| Browser roles attempt to read binding rows or private object bytes | Access denied. |
| Missing replay adapter in production composition | Plan preparation stops; zero dispatch claims and zero model calls. |

The DB fixture should prove held-out-only registration, project/version foreign-key scope, uniqueness, digest format, immutable binding, no browser grants, and transaction rollback on invalid registration. The unit suite should assert zero object reads for invalid manifest/scope, and zero runner claim/provider calls for every source-integrity failure.

## Integration sequence and exit criteria

1. Define the versioned case-input JSON schema and privacy classification rules for each supported agent task.
2. Implement sealed artifact registration that computes/verifies the payload digest from actual stored bytes and binds the held-out manifest case, project, version and cutoff.
3. Add immutable relational constraints and a private server read policy. Verify insert-only/sealed behavior and grants in a disposable PostgreSQL fixture.
4. Implement the injectable replay source module and fake-store unit tests listed above.
5. Implement the production Supabase reader with direct private byte retrieval and local SHA-256/length/schema verification. Do not use mutable generic object references without the sealed binding.
6. Wire the reader into the canonical plan loader, then run existing `verify:learning-experiment-runner`, runner service tests, TypeScript checking and SQL fixture. Confirm all replay failures leave dispatch claim and provider call counts at zero.
7. Independently audit project isolation, privacy minimization, hash/canonical-byte handling, stale behavior, error redaction, and storage deletion/retention semantics.
8. Only after all other independent activation gates are implemented may a separately authorized prospective test collect results. This contract itself does not authorize that test.

Exit criteria are exact-byte reproducibility, verified SHA-256 and scope on every read, held-out-only resolution, privacy-policy compliance, stale/missing/tampered fail-closed behavior, passing negative tests, and zero dispatch on any failure. Until then, keep the runner in preparation mode.

## Related records

- [Runner implementation checkpoint](learning-experiment-runner-implementation-20261001.md)
- [Runner post-implementation plan and results](learning-experiment-runner-post-implementation-20261002.md)
- [Pilot dataset readiness](learning-pilot-dataset-readiness-20261001.md)

