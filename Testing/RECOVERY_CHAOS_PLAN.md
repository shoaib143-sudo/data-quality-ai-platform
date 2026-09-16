# Reliability, Recovery, and Fault-Injection Plan

## Faults to inject

- Worker termination
- Database timeout/unavailability
- R2/storage failure
- Model/provider timeout and malformed response
- Network loss before and after commit
- Duplicate delivery/request
- Queue delay
- Browser/session interruption
- Partial downstream failure
- Deployment/restart during long-running work

## Concurrency

Exercise simultaneous approvals, duplicate execution, concurrent profiling, authority revocation during decision, policy change after approval, dataset/schema mutation during processing, concurrent remediation, and retry after lost response.

## Acceptance

Every critical failure must recover safely or fail closed. No scenario may silently produce contradictory UI, database, storage, execution, or audit state.


## Automated orchestration

Faults, races, retries, clock/expiry scenarios, revocations, provider failures, and recovery assertions are injected and evaluated by the harness. No operator is required to terminate workers, disconnect services, retry requests, or inspect whether recovery succeeded.
