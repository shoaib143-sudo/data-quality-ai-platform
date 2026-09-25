# Data products and AI context review

Source: the user-provided September 25 screenshot, “From Data Quality to Data Products, AI Context & Agents.” The vendor statements in the image are illustrative claims, not independently validated feature parity.

| Capability in image | DataNexus implementation evidence | Status | Disposition |
| --- | --- | --- | --- |
| Monitoring, investigation and data quality evidence | Profiling, findings, quality scores, issues, observability alerts, and governed agent runs are linked from Dataset 360. | PARTIAL | KEEP, then validate connected runs in the test environment. |
| Governed catalog with business meaning | Catalog metadata, classifications, glossary mappings, stewardship, and semantic catalog metadata search exist. | PARTIAL | KEEP; improve field-level context presentation. |
| Data contracts and product accountability | Versioned contracts, owners, certification workflow, and Dataset 360 links exist. The new consumer context section identifies missing evidence without awarding certification. | PARTIAL | BUILD_NOW for the read-only context inventory; BUILD_LATER for a separately governed product lifecycle and consumer marketplace. |
| Data marketplace and product consumption | The catalog provides discovery and dataset detail; there is no dedicated product registry, consumer subscription, or governed access request lifecycle in this review. | GAP_REQUIRED | BUILD_LATER with explicit product identity, project-scoped authorization, consumer entitlements, and audit. |
| Ontology and trusted AI context | Approved glossary, classifications, CDE mappings, lineage and semantic retrieval exist. A versioned ontology with governed relations and agent-visible context packages is not established by this review. | GAP_REQUIRED | BUILD_LATER; use approved evidence and provenance as the extension point. |
| MCP access to governed data products | No MCP server or client contract was found in the application code reviewed. | GAP_DEFERRED | EXTENSION_POINT; design a read-only, project-scoped surface after product identity and entitlements are defined. |
| Agent action and verification | Governed agent runtime, approval flows, run evidence, and recovery machinery exist. | PARTIAL | KEEP; test authorization and outcome verification in the existing run modes. |
| Federated data mesh | Domain metadata and project ownership exist, but a federated product policy and marketplace are not established by this review. | GAP_DEFERRED | BUILD_LATER after product ownership and consumption controls. |

The context section reads existing persisted records through the current user session and workspace policy. `NOT_VISIBLE` is distinct from a missing record. The section does not change ADR-007 agent classifications, certification authority, access control, execution permissions, or learning policy. It is replaceable as a pure presentation contract. Verification: the pure contract tests, TypeScript check, persona presentation gate, and UX gate. Live evidence, product consumption, ontology governance, and MCP interoperability still require separate implementation and acceptance.
