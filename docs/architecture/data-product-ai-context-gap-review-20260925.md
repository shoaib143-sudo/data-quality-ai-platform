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

## Additional implementation guidance from current references

The following points were added after reviewing current vendor and protocol documentation on September 25, 2026. They are design inputs, not claims that DataNexus already implements them.

### 1. Define a product as a governed consumer contract

Google's data mesh guidance describes a data product as a domain-owned unit that must meet organization-wide governance requirements, while its consumption guidance emphasizes that consumers need enough information to select and use a product safely. Databricks recommends domain-based catalogs for federated ownership, consistent naming, documented catalog purpose, and grants that control creation and access. citeturn2search14turn2search24turn2search30turn2search2

For DataNexus, a future `data_products` contract should include:

- stable product identity and version;
- owning domain, business owner, steward, and support contact;
- intended use, prohibited use, sensitivity, and consumer audience;
- input and output datasets, fields, transformations, and lineage;
- active data contract, quality thresholds, freshness SLA, and incident status;
- access mode and approval policy;
- lifecycle state, deprecation date, replacement product, and change history;
- usage, consumer feedback, and evidence links.

### 2. Keep discovery separate from entitlement

Product discovery should expose enough metadata for a consumer to evaluate suitability. It must not imply that the consumer can read the underlying data. The next implementation should therefore separate `catalog.read` from `product.request_access`, `product.approve_access`, and the final source or dataset capability. Every access decision should record the product version, policy decision, requester, approver, scope, expiry, and evidence.

### 3. Treat contracts as build and promotion gates

dbt's model contract guidance says a model does not build when its output does not conform to the declared shape. Its governance guidance also warns that contracts, versions, and access controls increase maintenance and can make changes harder while a model is still unstable. citeturn2search3turn2search12turn2search18

DataNexus should apply the same distinction: draft contracts can support design and testing, while only an approved active contract can support a product release or consumer access. Contract changes should calculate compatibility, require explicit versioning, and show migration or deprecation impact before activation.

### 4. Build an evidence-backed context package for agents

Google's current Knowledge Catalog material describes agent-ready context as governed metadata, lineage, quality, and policy assembled around enterprise data. Databricks' agent guidance recommends sandboxing actions or requiring human approval when agents can update records or run code. citeturn2search21turn2search33

The DataNexus context package should be a versioned, signed reference containing only authorized evidence: product and dataset identifiers, approved semantics, quality and freshness observations, lineage references, policy decisions, contract version, and freshness timestamps. The package should carry provenance per fact, a maximum age, a redaction result, and a fail-closed status when required evidence is missing or stale.

### 5. If MCP is added, make it a governed adapter

The MCP specification requires servers to validate tool inputs, enforce access controls, rate-limit invocations, and sanitize tool outputs. Its authorization guidance uses OAuth 2.1 protected-resource patterns, and its security guidance recommends trusted servers, narrow permissions, and token validation for the intended resource. citeturn3search0turn3search1turn3search5turn3search10turn3search28

The first DataNexus MCP surface should therefore be read-only and project-scoped. It should expose product metadata, approved context, lineage summaries, quality evidence, and contract status. Mutation tools should remain behind existing DataNexus authorization, approval, idempotency, audit, and verification boundaries. Do not pass arbitrary database or storage credentials through MCP.

### 6. Add measurable product SLOs

The product view should show current values and evidence for freshness, availability, quality, schema compatibility, incident recovery time, support response, and access request latency. A product should not be promoted because metadata is complete if its operational SLO evidence is missing. These measures also give the Command Center a useful basis for product trust trends and agent recommendations.

### Recommended implementation order

1. Add product identity and versioned lifecycle records around existing datasets.
2. Add consumer discovery and separate entitlement requests from catalog visibility.
3. Bind products to existing contracts, quality scores, lineage, glossary, classification, and incident evidence.
4. Generate versioned, redacted context packages for governed agent reads.
5. Add domain federation and product usage analytics.
6. Add a read-only MCP adapter after authorization and evidence contracts pass tests.

### Sources

- Google Cloud, [Architecture and functions in a data mesh](https://docs.cloud.google.com/architecture/data-mesh), [Build data products in a data mesh](https://docs.cloud.google.com/architecture/build-data-products-data-mesh), and [Discover and consume data products](https://docs.cloud.google.com/architecture/discover-consume-data-products-data-mesh).
- Databricks, [Design Unity Catalog architecture](https://docs.databricks.com/gcp/en/lakehouse-architecture/deployment-guide/unity-catalog) and [Agent system design patterns](https://docs.databricks.com/aws/en/agents/agent-system-design-patterns).
- dbt Developer Hub, [Model contracts](https://docs.getdbt.com/docs/mesh/govern/model-contracts) and [Model governance](https://docs.getdbt.com/docs/mesh/govern/about-model-governance).
- Model Context Protocol, [Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization), [Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices), and [Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
