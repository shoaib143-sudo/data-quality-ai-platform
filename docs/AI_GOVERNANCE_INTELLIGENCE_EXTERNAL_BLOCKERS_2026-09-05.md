# AI Governance Intelligence external-blocker checkpoint

Date: 2026-09-05

## Executive state

The Profiling Demo Project has zero implementation failures in the formal AI Governance Intelligence gate.

Current production result:

- overall status: `PARTIAL`
- implementation failures: `0`
- external/data blockers: `2`
- semantic/RAG: `PASS`
- immutable audit chain: `PASS`
- platform contract checks: `PASSED` for all four active projects

The remaining work is limited to authentic source artifacts that are not present in the connected repository or production data estate. Production evidence must not be fabricated to close either blocker.

## Blocker 1: real field-level transformation metadata

Tracked by GitHub issue #4.

### Implemented and verified

The governed lineage intake path is normalized by `lib/governance/lineage-adapters.ts` and exposed through `app/api/lineage/ingest/route.ts`.

Migrations:

- `20260905034719_atomic_lineage_batch_ingestion`
- `20260905035122_reject_lineage_replay_payload_collisions`

`governance.ingest_lineage_batch_atomic(...)` is the authoritative public write boundary. Its persistence implementation is isolated behind `governance.ingest_lineage_batch_atomic_impl(...)`, which is not executable by service-role, authenticated, anon or public callers. The service-role application credential can invoke only the replay-validating wrapper.

The production persistence transaction covers:

- `governance.lineage_integrations`
- `governance.lineage_assets`
- `governance.lineage_transformations`
- `governance.lineage_column_mappings`
- `governance.lineage_edges`
- `governance.lineage_ingestion_events`
- `governance.audit_events`

The API normalizes source payloads and submits one RPC rather than issuing independent lineage writes. PostgreSQL rechecks `lineage.manage`, the wrapper is service-role-only, and deterministic transaction-scoped advisory locks protect concurrent project/event retries before the idempotency lookup.

Rollback-only production verification exercised a complete transformation, one field mapping, one edge, one ingestion event and the batch audit. An identical retry reused the event instead of duplicating it. A deliberately failing two-event batch failed only after its first event had written intermediate state inside the RPC; the caught failure left no first-event or integration residue. This proves the deployed batch is all-or-nothing.

Replay integrity is also enforced before persistence delegation:

- identical `project_id + external_event_id + payload_hash + source` retries remain idempotent
- an existing `external_event_id` with a different SHA-256 payload hash is rejected
- an existing `external_event_id` reused by a different source identity is rejected
- a single submitted batch containing one event ID with different payload hashes is rejected before persistence
- each replay hash must satisfy the 64-character lowercase hexadecimal SHA-256 contract

The replay-hardening migration was compiled and exercised in a rollback-only production transaction before deployment. Identical replay, payload collision and source collision behavior all passed, and the test left zero lineage rows or implementation wrappers behind after rollback.

`app/api/lineage/ingest/route.ts` requires `audit_atomic=true` and `database_capability_verified=true` from the database result. `scripts/verify-lineage-atomic-ingestion.mjs` and the Quality Gate protect atomicity, authorization, idempotency and replay-collision contracts.

### Exact missing artifact

At least one genuine source transformation artifact for an onboarded source is required. Acceptable evidence includes real SQL transformation logic, a dbt model/manifest, ETL mapping, Spark/Databricks job metadata, stored-procedure transformation metadata, or a BI semantic mapping that identifies real source and target fields.

The connected estate currently exposes none of those artifacts for the demo source. `governance.lineage_column_mappings` therefore remains at zero real mappings for the project.

## Blocker 2: approved enterprise governance corpus

Tracked by GitHub issue #5.

### Implemented and verified

Production enforces explicit enterprise-document review rather than inferring authority from a non-synthetic flag.

Migrations:

- `20260905030354_governed_enterprise_knowledge_document_approval`
- `20260905030459_align_enterprise_knowledge_requirement_priority`
- `20260905034044_enqueue_governance_document_semantic_refresh`

The governed path includes:

- `app/api/governance/knowledge/ingest/route.ts`
- `app/api/governance/knowledge/review/route.ts`
- `governance.ingest_governance_knowledge_document(...)`
- `governance.review_governance_knowledge_document(...)`
- `trg_protect_knowledge_document_review`
- `trg_enqueue_knowledge_document_semantic_refresh`
- lexical parent-document approval filtering
- semantic parent-document approval filtering
- formal-gate counting only ACTIVE, APPROVED, non-bootstrap enterprise documents

Authenticated browser roles cannot directly insert/update/delete `governance.knowledge_documents` or `governance.knowledge_requirements`. The privileged ingestion and review RPCs are service-role-only and perform capability checks inside PostgreSQL.

Rollback-only verification exercised pending ingestion, direct approval-bypass rejection, authorized approval, search visibility and material-change reset behavior. Test document, requirement and audit rows all rolled back cleanly.

The post-review semantic lifecycle is event-driven and durable:

- approval queues a `SEMANTIC_INDEX` project refresh
- rejection queues semantic pruning
- a material edit that resets APPROVED to PENDING queues semantic pruning
- deletion of an ACTIVE approved document queues semantic pruning
- semantic refresh jobs use `entity_id = project_id` so later successful project indexing supersedes an event-driven failure under platform-health recovery semantics
- semantic refresh enqueue uses project-scoped idempotency keys
- `governance.review_governance_knowledge_document(...)` resets its transaction-local review context before returning

The event-driven migration was compiled and exercised in a rollback-only production transaction before deployment. Approval enqueue, approval-reset enqueue and approved-document deletion enqueue all passed, with zero test semantic jobs leaked after rollback.

### Exact missing artifact

At least one genuine organization-authoritative governance document with explicit provenance and authorization to treat it as enterprise governance is required. Examples include an approved internal policy, standard, procedure, business glossary/CDE registry, ownership/stewardship standard, enterprise data contract or certification evidence.

The current 12-document knowledge corpus remains explicitly bootstrap/synthetic for this gate. Approved enterprise documents remain zero. Product/architecture discussions and public reference material are not enterprise-authoritative substitutes.

## Final verification boundary

After the implementation hardening, the formal AI Governance Intelligence gate remains intentionally `PARTIAL` with `failure_count=0` and exactly two external data blockers:

- `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`
- `REAL_GOVERNANCE_CORPUS_NOT_INGESTED`

No remaining core implementation change can truthfully satisfy those two checks without the authentic external artifacts described above.
