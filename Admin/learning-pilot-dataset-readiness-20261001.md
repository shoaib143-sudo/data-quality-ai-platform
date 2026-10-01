# Learning pilot dataset readiness, 2026-10-01

## Scope and result

Read-only metadata inspection of Supabase project `tvjnavjxuehpesxcfvrx`. No source rows, credentials, storage URLs, model calls, live manifest registrations, or live releases were accessed or created. This is readiness evidence, not evidence of improvement.

**Result: Album is an existing pilot candidate, but an immutable replay source and benchmark manifest are not yet verified. Continue the $0 synthetic pilot independently of these live datasets.** A catalog hash alone does not prove that an evaluator can retrieve the same bytes later.

## Verified Album metadata

| Field | Observed value |
|---|---|
| Project | Profiling Demo Project |
| Project ID | `479813aa-72a4-4b12-b72a-74da8d2419ce` |
| Dataset | Album |
| Dataset ID | `ab520b1f-1f4c-4bdd-900a-c6be51957975` |
| Version ID | `f90abfb8-3e58-447f-9ff2-79ee1d70eb2d` |
| Version number / state | `1` / `AVAILABLE` |
| Dataset state | `ACTIVE` |
| Row / column counts | `347` / `3` |
| Content hash | `e097480afb91cbd07dc41bc28d6d80f96f19f8b55827577031c9af28c18b1057` |
| Schema hash | `af6f99e9a2bea6bdfb0c12ead87de275f84d7e5a8d4b8d017073c66ceb3293d1` |
| Storage object ID / size bytes | `NULL` / `NULL` |
| Version created / observed | `2026-09-07T01:14:40.851924Z` / `2026-09-08T13:17:34.329118Z` |

The hash strings have SHA-256 shape; their correspondence to replayed bytes was not verified. No storage object is bound to this version. An immutable external snapshot could satisfy provenance separately, but no such snapshot was verified in this metadata-only review.

There are **zero** rows in `agent.learning_benchmark_dataset_manifests`. Across the catalog, **28** versions exist, **1** has a storage binding and **27** do not. Current dataset-version triggers include storage invariants, projection outbox, governance and lineage insertion. The storage-invariant function explicitly accepts a null storage object and requires matching project and `READY` state only when one is supplied. These checks do not establish immutable snapshot bytes for Album.

## Smaller existing alternatives

| Dataset | Version ID | Rows / columns | Assessment |
|---|---|---|---|
| MediaType, same demo project | `b7e0d673-9586-49d4-a387-8dad0b238aab` | 5 / 2 | Both hashes present, no storage binding. Small contract smoke candidate; too small to claim meaningful improvement without an independently justified case plan. |
| Genre, same demo project | `2edc1dc7-4085-492b-8dbe-20df30f59127` | 25 / 2 | Both hashes present, no storage binding. Prefer for low-volume retrieval/profiling smoke preparation if snapshot provenance is resolved. |
| Product, Product project | `6a194928-0cce-42d2-83ba-b7d6b9508228` | 1 / 8 | `READY` Supabase object `8c570d9a-1747-48fd-965e-53cfed12c1cb`, verified-at metadata present, but storage checksum and checksum algorithm null. One record alone does not establish separate independent training and held-out cases. |

Names such as Demo, Genre or MediaType do not establish privacy classification or authorization. No raw rows were inspected to infer that these datasets are safe. The most reliable $0 path remains repository-owned synthetic cases with explicit provenance; smaller catalog metadata does not cure the snapshot gap.

## Exact evidence needed before a live dataset policy

1. Resolve an authorized, stable source snapshot for the selected version. Establish how its bytes or canonical case content are retained, reloaded and hashed; record the verification evidence and project ownership. Do not rewrite existing catalog hashes to make checks pass.
2. Establish privacy classification and permitted evaluator input. Retain opaque references and digests in the manifest; avoid customer content in GitHub or evaluation telemetry.
3. Define independently justified evaluation cases and a frozen training/held-out split, deterministic seed, source-case references and evidence cutoff. Dataset row count is not necessarily evaluation case count. Avoid duplicate or related-source leakage across splits.
4. Compute canonical case keys and manifest hash from actual pinned cases. `agent.register_learning_benchmark_dataset` requires a nonempty unique case array, SHA-256 case keys, nonempty opaque references, at least one `TRAINING` and one `HELD_OUT` case, and exact manifest digest agreement.
5. Register once through the authorized server path after source and case evidence exists. The manifest and case records reject updates/deletes; registration cannot be used as a placeholder for future facts.
6. Bind the locked evaluation policy to the same project, sealed manifest ID/hash and dataset-version allowlist. The existing policy checks a manifest's textual version against that allowlist; it does not independently retrieve catalog source bytes. Prospective evaluation evidence still requires actual held-out executions and independent evaluator identity.

Canonical hash input is the sorted sequence `case_key:split:source_case_ref` joined with `|`, then SHA-256 with `sha256:` prefix. Source snapshot, split seed and evidence cutoff are required manifest metadata, but this digest covers case assignments and references only. Snapshot content verification is therefore a separate necessary evidence step.

## Native capability assessment

| Capability | Status | Disposition | Evidence or gap |
|---|---|---|---|
| Immutable split membership and case digest binding | PARITY | KEEP | Native sealed manifest, canonical digest and update/delete rejection. |
| Replayable content provenance for this Album version | GAP_REQUIRED | BUILD_NOW | Metadata hash exists, replay bytes and immutable reference unverified. |
| Independent training/held-out data selection | PARTIAL | BUILD_NOW | Contract exists; no actual registered manifest or verified case selection. |
| Framework replacement or benchmark comparison | NOT_APPLICABLE | BENCHMARK_LATER | This read-only dataset review does not replace the native runtime or alter ADR-007 classifications. |

Authority remains DataNexus-owned: project access, agent permissions, model routing, evaluator independence, approvals, budget admission and release/rollback evidence. A synthetic fixture cannot be promoted into live evidence or bypass these boundaries.

## Sources and verification

- Live read-only SQL over `catalog.datasets`, `catalog.dataset_versions`, `catalog.storage_objects`, `app.projects`, `agent.learning_benchmark_dataset_manifests` and `information_schema` on 2026-10-01.
- `supabase/migrations/20260929000300_learning_benchmark_dataset_manifest.sql`.
- `supabase/migrations/20260930123000_governed_learning_evaluation_release_admission.sql`.
- `supabase/migrations/20260917001200_harden_storage_invariant_function_search_path.sql`.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control): storage policy enforcement and server service keys are distinct from source-byte integrity. Documentation checked 2026-10-01. The skill-mandated changelog Markdown fetch was attempted; the retrieval service rejected its content type. No Supabase schema or API feature was implemented in this workstream.
