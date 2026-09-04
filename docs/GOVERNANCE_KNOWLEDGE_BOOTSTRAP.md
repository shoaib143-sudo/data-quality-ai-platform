# Governance Knowledge Bootstrap

This document records the synthetic bootstrap used to activate the first AI Governance Intelligence knowledge model in the Profiling Demo Project.

## Purpose

The bootstrap exists to prove the complete knowledge lifecycle before real enterprise policies, standards, glossary terms, CDEs and stewardship records are loaded. Seeded records are explicitly marked with `synthetic_bootstrap=true` so they can be identified, replaced or removed later.

The synthetic content is original project content. Public sources informed the concepts and terminology but were not copied into the seed corpus. The privacy examples are not legal advice.

## Public research basis

- European Data Protection Board, GDPR basic principles: https://www.edpb.europa.eu/topics/key-gdpr-concepts/basic-principles_en
- NIST Privacy Framework: https://www.nist.gov/privacy-framework
- NIST Cybersecurity Framework 2.0: https://www.nist.gov/cyberframework
- UK Government Data Quality Framework: https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework
- UK Government Data Quality Framework guidance: https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework-guidance
- ICO storage-limitation guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/
- ISO 8000-1 overview: https://www.iso.org/standard/81745.html
- ISO 8000-150 roles and responsibilities overview: https://www.iso.org/standard/80753.html

## Bootstrap inventory

The initial seed creates:

- 4 synthetic governance knowledge documents
  - Enterprise Personal Data Governance Policy
  - Customer Master Data Quality Standard
  - Critical Data Element Management Standard
  - Data Retention and Lifecycle Procedure
- 12 extracted governance requirements
- 30 approved glossary terms
- 8 Critical Data Elements
- 8 suggested CDE-to-column mappings for `Customer 2nd Master`
- 8 suggested glossary-to-column mappings
- 5 suggested PII classifications requiring human approval
- 1 synthetic PII handling policy
- 11 knowledge-to-CDE relationships

## Retrieval model

`governance.search_governance_knowledge_lexical` is the always-available PostgreSQL fallback. It searches active knowledge documents, requirements, glossary terms and CDEs within the caller's project scope.

`lib/governance/semantic-knowledge-indexer.ts` projects the same knowledge into `governance.semantic_embeddings` when `GOVERNANCE_EMBEDDING_URL` is configured. The semantic worker treats these embeddings as rebuildable projections; PostgreSQL remains authoritative.

`GET /api/governance/knowledge/search?projectId=<uuid>&q=<query>` provides governed project-scoped hybrid retrieval. It uses lexical retrieval immediately and adds pgvector semantic matches when an embedding provider is available.

## Governance boundary

AI-generated mappings and classifications are deliberately stored as `SUGGESTED`. Human approval remains required before they become authoritative governance decisions.

## First acceptance query

A query for `email` should retrieve at least:

1. `Customer Email Address` glossary term
2. `CUSTOMER_EMAIL` Critical Data Element
3. the email validity quality requirement
4. the Customer Master Data Quality Standard

The next acceptance milestone is to ground Steward and Governance Analyst agent responses in this corpus and return evidence, confidence, CDE, classification and applicable policy context for `Customer 2nd Master.email`.
