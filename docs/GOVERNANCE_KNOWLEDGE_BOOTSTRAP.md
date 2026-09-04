# Governance Knowledge Bootstrap

This document records the synthetic bootstrap used to activate the AI Governance Intelligence knowledge model in the Profiling Demo Project.

## Purpose

The bootstrap proves the complete governance-knowledge lifecycle before real enterprise policies, standards, glossary terms, CDEs, contracts, ownership, certifications and operating history are loaded. Seeded records are explicitly marked with `synthetic_bootstrap=true` so they can be identified, replaced or removed later.

The synthetic content is original project content. Public sources informed concepts and terminology but were not copied into the seed corpus. Privacy/regulatory examples are not legal advice.

## Public research basis

- European Data Protection Board, GDPR basic principles: https://www.edpb.europa.eu/topics/key-gdpr-concepts/basic-principles_en
- EUR-Lex, Regulation (EU) 2016/679: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- NIST Privacy Framework: https://www.nist.gov/privacy-framework
- NIST Cybersecurity Framework 2.0: https://www.nist.gov/cyberframework
- UK Government Data Quality Framework: https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework
- UK Government Data Quality Framework guidance: https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework-guidance
- ICO storage-limitation guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/
- PCI Security Standards Council, PCI DSS overview: https://www.pcisecuritystandards.org/standards/pci-dss/
- ISO 8000-1 overview: https://www.iso.org/standard/81745.html
- ISO 8000-150 roles and responsibilities overview: https://www.iso.org/standard/80753.html

## Operationalized knowledge domains

| Knowledge domain | Bootstrap state |
| --- | --- |
| Business glossary | 30 approved synthetic terms with definitions, synonyms and domains |
| Policies | Enterprise Personal Data Governance Policy + extracted controls |
| Standards | Customer DQ, CDE, classification, ownership/stewardship, data-contract and certification standards |
| Regulations | GDPR applicability reference with explicit REVIEW_REQUIRED scope record |
| Classifications | PII, PCI plus project-scoped Confidential, Restricted and Internal labels; AI suggestions remain non-authoritative |
| CDEs | 8 active CDEs mapped to Customer 2nd Master columns |
| Ownership | Business-owner and technical-owner role assignments |
| Stewardship | Data-steward role assignments |
| Data contracts | Active Customer Master Data Contract v1 with freshness and quality expectations |
| Certifications | Provisional Customer Master certification with evidence and review window |
| Issues/incidents | Resolved duplicate-identifier issue and freshness-delay incident |
| Remediation knowledge | One WORKED and one FAILED reusable remediation case |

## Live bootstrap inventory

The active seed contains at least:

- 12 governance knowledge documents
- 20 extracted requirements/controls
- 30 glossary terms
- 8 Critical Data Elements
- 8 suggested CDE-to-column mappings
- 8 suggested glossary-to-column mappings
- 5 suggested PII classifications requiring human approval
- project-scoped Confidential, Restricted and Internal classification labels in addition to global PII/PHI/PCI labels
- 7 role-based accountability assignments
- 4 executable DQ rule definitions
- 1 active versioned data contract
- 1 provisional certification plus supporting certification request
- 1 resolved governance issue
- 1 resolved observability incident
- 2 remediation-knowledge cases
- 42 governance knowledge relationships

## Retrieval model

`governance.search_governance_knowledge_lexical` is the always-available PostgreSQL fallback. It searches active knowledge documents, requirements, glossary terms and CDEs within project scope.

`lib/governance/semantic-knowledge-indexer.ts` projects documents, controls, CDEs, contracts, certifications, remediation cases, accountability, regulatory applicability and classifications into `governance.semantic_embeddings` when `GOVERNANCE_EMBEDDING_URL` is configured. PostgreSQL remains authoritative and embeddings remain rebuildable.

`GET /api/governance/knowledge/search?projectId=<uuid>&q=<query>` provides governed project-scoped hybrid retrieval. It uses lexical retrieval immediately and adds pgvector semantic matches when an embedding provider is available.

## Data Estate Knowledge Graph

`governance.knowledge_relationships` is the authoritative governance-reasoning edge store. `governance.traverse_knowledge_graph` performs bounded project-scoped traversal with a maximum depth of 8 and maximum 400 returned edges. `GET /api/governance/knowledge/graph` exposes the same traversal under `lineage.read` authorization.

The acceptance chain is explicitly represented:

```text
REGULATION:EXT-REG-GDPR
  → DRIVES_POLICY
POLICY:SYN-POL-PERSONAL-DATA
  → IMPLEMENTED_BY_CONTROL
CONTROL:PD-04
  → GOVERNS_TERM
BUSINESS_TERM:Customer Email Address
  → DEFINES_CDE
CDE:CUSTOMER_EMAIL
  → MAPPED_TO_DATASET
DATASET:Customer 2nd Master
  → HAS_COLUMN
COLUMN:email
  → MONITORED_BY_RULE
DQ_RULE:CUSTOMER_EMAIL_VALIDITY
  → ACCOUNTABLE_TO / STEWARDED_BY
OWNER_ROLE / STEWARD_ROLE
```

Side relationships also cover classification, contract, certification, issue/incident and remediation knowledge.

## Governance boundary

AI-generated mappings and classifications are deliberately stored as `SUGGESTED`. Regulatory applicability is `REVIEW_REQUIRED`. The synthetic certification is `PROVISIONAL`. Human approval remains required before these become authoritative enterprise decisions.

Role-based accountability is used for the bootstrap rather than inventing fake people. Organization-specific user assignments can later bind these roles to real identities.

## Step 1 acceptance evidence

The live lexical query `email` returns, among other results:

1. `Customer Email Address` glossary term
2. `CUSTOMER_EMAIL` Critical Data Element
3. the email validity requirement
4. the Customer Master Data Quality Standard

The live bounded graph traversal from `REGULATION:EXT-REG-GDPR` reaches policy, controls, Customer Email business term, CDE, Customer 2nd Master, `email`, `CUSTOMER_EMAIL_VALIDITY`, Customer Data Owner and Customer Data Steward.

Step 1 is considered complete when these contracts remain protected by CI and the Steward/Governance Analyst agents can consume the search and graph evidence. Agent specialization is handled in the later AI-agent wave rather than overloading the knowledge-model implementation.
