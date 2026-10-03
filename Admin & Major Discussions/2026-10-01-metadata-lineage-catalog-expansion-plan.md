# Metadata, Lineage and Catalog Expansion Plan

Date: 2026-10-01

## Decision

The requested metadata, lineage, catalog, workflow and integration capabilities fit DataNexus and should be incorporated into the current product roadmap. The implementation should extend existing governed discovery, lineage, catalog, approval, notification and observability foundations rather than create a parallel subsystem.

## Current repository baseline

DataNexus already contains useful foundations for this scope:

- Technical discovery and profiling of governed sources.
- Physical metadata versioning with structure hashes and version numbers.
- Separate source annotation history for source-native descriptions, owners, comments and tags.
- Lineage assets, transformations, edges and explicit source-to-target column mappings.
- Transformation logic, operation, logic language and logic hashes.
- Interactive field-level lineage explorer with governance, DQ, stewardship, classification, contract, issue and observability overlays.
- Atomic lineage ingestion with normalized adapters.
- Change-impact approval workflows.
- Durable alert notifications with email, Slack and webhook routes.
- Incremental execution eligibility based on source-observed watermarks.
- Governed job monitoring and execution evidence.

## Requested capability map

### 1. Metadata and lineage capture

#### Technical metadata
Capture tables, columns, data types, keys where observable, source identifiers, transformation logic, lineage mappings and source-native annotations.

#### Automated scanning
Extend discovery to support source presets and connector capability negotiation so common sources need only credentials, endpoint, scope and scan policy.

#### Schema change and incremental updates
Use existing structure hashes and version history as the base. Add first-class change events:
- object created
- object removed
- column added
- column removed
- type changed
- nullability changed
- key changed
- source annotation changed
- lineage mapping changed
- transformation logic changed

Incremental discovery remains allowed only when the source provides an authoritative monotonic change boundary. Otherwise DataNexus must use bounded full or sampled discovery.

#### Business metadata
Business metadata should be captured and managed, not treated as unsupported. Sources include:
- glossary definitions
- business descriptions
- owners and stewards
- domain
- critical data element status
- classifications and tags
- certification state
- usage context
- data product membership
- policy and contract context

Source-native business annotations and DataNexus-governed annotations must remain separately versioned.

### 2. Metadata and lineage management

#### Error handling
Every scan and lineage ingestion run should expose:
- run ID
- connector
- source
- current stage
- timestamps
- diagnostic code
- safe diagnostic message
- retryability
- affected assets
- persisted execution logs
- rescan action

#### Re-scan and correction
Add controlled rescan and correction workflows:
- rescan source
- rescan selected schema
- rescan selected asset
- re-ingest lineage
- propose manual lineage correction
- approve or reject correction
- preserve superseded lineage rather than silently overwrite evidence

### 3. Version control

Existing metadata history should be extended into a unified change timeline for:
- physical metadata
- business annotations
- lineage edges
- column mappings
- transformation logic
- catalog classifications and tags

Rollback semantics:
- Physical source metadata cannot be rolled back in the source by DataNexus.
- DataNexus annotations and curated lineage can support governed rollback by creating a new version that restores a previously approved state.
- Historical versions must remain immutable and auditable.

### 4. Workflows and notifications

Metadata and lineage changes should use the existing governance workflow engine.

Workflow examples:
- approve business metadata change
- approve owner or steward reassignment
- approve manual lineage correction
- approve critical transformation change
- approve classification change

Notifications should reuse the current durable notification framework and route to impacted:
- data owners
- stewards
- data product owners
- downstream consumers
- compliance or privacy roles
- source system owners

### 5. Catalog

Expand the current catalog as the primary governed repository for:
- technical metadata
- business metadata
- lineage
- quality evidence
- observability
- ownership
- tags and classifications
- certification
- contracts

Search and filtering should cover technical and business fields with saved filters and persona-aware defaults.

Tagging should support source-native tags and governed DataNexus tags with separate authority and provenance.

### 6. Lineage visualization

Enhance the current lineage explorer into a source-to-report interactive flow.

Required interaction:
- table and field mode
- expand upstream
- expand downstream
- transformation node inspection
- column mapping inspection
- transformation expression inspection
- impact overlays
- DQ overlays
- ownership overlays
- certification overlays
- observability overlays
- temporal view by metadata or lineage version
- change comparison

### 7. Lineage export

Add governed Excel export for Data Stewards, Metadata Analysts, Data Quality Analysts and other authorized personas.

Recommended workbook:
- Summary
- Source to Target Mapping
- Transformations
- Assets
- Columns
- Business Metadata
- Data Quality Context
- Issues and Alerts

Minimum Source to Target Mapping columns:
- Lineage Name
- Hop
- Source System
- Source Database
- Source Schema
- Source Table
- Source Column
- Source Data Type
- Transformation Rule
- Transformation Language
- Target System
- Target Database
- Target Schema
- Target Table
- Target Column
- Target Data Type
- Change Type
- Confidence
- Evidence Source
- First Seen
- Last Seen
- Version
- Notes

### 8. Metadata federation

Introduce a canonical metadata exchange contract rather than copying external catalogs directly into internal tables.

Supported modes:
- pull metadata from external catalog
- push approved metadata to external catalog
- cross-catalog reference
- source authority priority
- conflict detection
- provenance preservation

Initial targets should use open or widely adopted APIs where available.

### 9. BI integration

Add connector contracts for BI metadata and lineage.

Priority candidates:
- Power BI
- Tableau
- Looker

The connector should ingest:
- workspaces or projects
- reports
- dashboards
- semantic models
- datasets
- fields
- calculated fields
- refresh relationships
- upstream data sources
- report-level lineage

## Expanded source scanning scope

### Source code and automation
- .NET
- Node.js
- scripts
- logs
- VBA
- Excel macros

### Databases
- Oracle
- Microsoft SQL Server

### ETL and integration tools
- Boomi
- Datamagic
- Informatica
- WebOTX
- Axway
- Agile Reporter
- SSIS

Implement each through the same canonical discovery and lineage contracts so connector-specific parsing does not leak into the governance model.

## Delivery workstreams

1. Metadata capture, schema drift, versioning and scan diagnostics.
2. Interactive lineage, transformation drilldown and Excel export.
3. Catalog search, tagging, business metadata and version timeline.
4. Approval, correction, rescan, rollback and stakeholder notifications.
5. Connector expansion, federation and BI integrations.
6. Observability and job-progress integration across all scans and lineage operations.

## Guardrails

- Never infer lineage as authoritative when it is not persisted or source-observed.
- Keep physical metadata authority distinct from human-curated metadata.
- Preserve immutable historical evidence.
- Do not silently overwrite lineage or business annotations.
- Require governed authorization for mutation and rollback actions.
- Keep secrets out of scanner payloads and persisted transformation logic.
- Every connector must emit normalized evidence into shared contracts.
- Every run must be traceable in Job Monitor.


## AI observability implementation notes

The observability expansion now follows a layered model inspired by current enterprise AI-governance and data-security tooling:

- **Registry and governance posture:** provider, model/version, lifecycle state, intended use, risk tier and required human oversight.
- **Operational health:** invocation volume, error count, success rate, P95 latency, token volume and cost.
- **Traceability:** OpenTelemetry trace/span coverage from persisted AI telemetry, without exposing prompts, completions or hidden reasoning.
- **Source/data posture:** connected source health, latest metadata-scan evidence, schema-change signals and governed classifications/ownership.
- **Auditability:** governed evidence IDs, approvals, lineage, workflow state and immutable change history remain separate from raw model telemetry.
- **Notification routing:** approved metadata and lineage changes can publish durable stakeholder alerts through existing Email, Slack or webhook routes when the corresponding notification flag is enabled.

The implementation intentionally does not persist prompts, completions or private reasoning merely to increase observability coverage. DataNexus uses bounded operational and governance evidence instead.
