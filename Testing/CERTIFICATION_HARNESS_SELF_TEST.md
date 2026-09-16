# Certification Harness Self-Testing

## Principle

The automated certification harness is itself a critical system and must prove that it detects known-bad behavior.

## Sentinel defect tests

In isolated test targets deliberately introduce or simulate defects such as:

- Disabled/bypassed RLS
- Approval bypass
- Missing audit event
- Corrupt execution fingerprint
- Cross-project disclosure
- Fabricated finding
- Incomplete execution payload
- Unauthorized agent tool invocation
- Incorrect quality calculation
- Stale UI/backend disagreement
- Lost/duplicated side effect
- Broken cleanup or fixture isolation

The harness must fail the corresponding certification gate.

## Harness integrity

Version test code, fixtures, evaluators, thresholds, environment configuration, and evidence schema. Detect skipped/disabled mandatory suites and unexpected test-count reductions. Fail closed when required evidence cannot be collected.
