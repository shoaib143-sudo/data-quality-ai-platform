# Certification Test Data Catalog

Maintain resettable synthetic assets with known expected truth.

## Dataset families

- Clean baseline
- Null-heavy
- Duplicate-heavy
- Mixed/invalid types
- Unicode and special characters
- Extreme numeric values
- Long strings
- Valid/invalid dates
- Empty dataset and empty columns
- High-column-cardinality dataset
- Large-row-volume dataset
- Sensitive/PII dataset
- Schema drift v1/v2
- Malformed file
- Prompt-injection content embedded in values, metadata, and column names

Equivalent database-table and object-storage variants should exist where relevant.

## Rules

Never rely on uncontrolled production data for deterministic certification. Each fixture must document expected schema, metrics, classifications, findings, scores, and other truth assertions needed by its journeys.
