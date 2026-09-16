# DataNexus Certification Matrix

## Mandatory gates

| Gate | T0 | T1 | T2 | T3 | T4/T5 |
| --- | --- | --- | --- | --- | --- |
| Unit/contract | Required | Required | Required | Required | Required |
| API/service integration | As applicable | Required | Required | Required | Required |
| Database/RLS/RPC | As applicable | Required | Required | Required | Required |
| Negative/boundary | Required | Required | Required | Required | Required |
| RBAC/security | Required | Required | Required | Required | Required |
| State transitions | As applicable | Required | Required | Required | Required |
| Concurrency/idempotency | As applicable | Required | Required | Required | Required |
| Recovery/fault injection | As applicable | Required | Required | Required | Required |
| AI evals | No | If AI | If AI | Required | Required |
| Prompt/tool adversarial | No | If AI | If AI | Required | Required |
| Real browser E2E | Smoke | Required | Required | Required | Required |
| UI/API/DB/audit reconciliation | As applicable | Required | Required | Required | Required |
| Performance envelope | As applicable | Required | Required | Required | Required |
| Production smoke | Required | Required | Required | Required | Required |
| Rollback/recovery evidence | As applicable | As applicable | Required | Required | Required |

## Certification result

A feature is CERTIFIED only when all applicable mandatory gates pass on the exact certified revision/deployment and there are no open critical or high-severity defects affecting its scope.

Allowed statuses: NOT_ASSESSED, IN_PROGRESS, BLOCKED, FAILED, CERTIFIED, CERTIFICATION_SUSPENDED.
