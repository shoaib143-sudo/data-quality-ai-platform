# Migration and Backward-Compatibility Plan

## Automated scenarios

- Upgrade from supported prior schema/application versions
- Existing datasets, versions, findings, policies, approvals, evidence, lineage, agent state, and storage references remain valid
- Partial migration failure and retry
- Idempotent migration/redeployment
- Mixed-version transition where architecture permits
- Rollback/downgrade where officially supported
- Reconstruction from clean database plus migrations/seeds
- Compatibility of persisted execution/approval contracts across releases

Migration certification reconciles row/object counts, constraints, permissions, invariants, and representative business journeys before and after migration.
