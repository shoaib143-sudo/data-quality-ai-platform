# Recovery Assurance v2 evidence schema

Every full-platform recovery drill should emit a single JSON evidence document outside the source database and persist its reference in `governance.backup_restore_drills.external_evidence_ref`.

Minimum fields:

```json
{
  "schemaVersion": 1,
  "recoveryMechanism": "MANAGED_PITR",
  "incidentAt": "ISO-8601 timestamp",
  "recoveryPointAt": "ISO-8601 timestamp",
  "startedAt": "ISO-8601 timestamp",
  "serviceReadyAt": "ISO-8601 timestamp",
  "sourceCommitSha": "git sha",
  "workflowRunId": "workflow run identifier",
  "scopeResults": {
    "DATABASE": { "status": "PASSED" },
    "STORAGE": { "status": "PASSED" },
    "IDENTITY_CONFIG": { "status": "PASSED" },
    "APPLICATION_CONFIG": { "status": "PASSED" },
    "EDGE_RUNTIME": { "status": "PASSED" },
    "DEPENDENCIES": { "status": "PASSED" },
    "SERVICE_VALIDATION": { "status": "PASSED" }
  }
}
```

Evidence can include hashes, object counts, deployment IDs, service IDs, migration versions, function versions, health-check results, timings, and sanitized failure messages. It must not contain database passwords, service-role keys, bearer tokens, private keys, OAuth secrets, signing secrets, or secret environment-variable values.
