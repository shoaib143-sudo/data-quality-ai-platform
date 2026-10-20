# Job Monitor Neural Progress Post-Implementation Assurance Plan

Date: 2026-10-03
Scope: PR #1120 runtime-backed neural execution progress and its post-merge assurance.

## Objective

Prove that the Job Monitor neural execution view is derived only from authorized durable runtime evidence, remains deterministic under refresh and failure conditions, and cannot manufacture progress.

## Re-validation

1. Re-run the Job Monitor domain consistency contract.
2. Re-run runtime-backed neural progress tests.
3. Re-run radial topology and domain-cell contracts through the existing monitoring assurance workflows.
4. Re-run repository Quality Gate, CodeQL, Navigation Integrity, P0-P5 revalidation, V6 certification, Release Provenance, and Post Implementation Assurance.
5. After production promotion, verify `/api/build-info` reports the exact promoted SHA.
6. Verify authenticated `/monitoring` renders the expected neural topology, execution pulse, and persisted statuses.

## Independent adversarial audit

The dedicated script `scripts/audit-job-monitor-neural-progress-adversarial.mjs` verifies:

- initial step hydration is scoped only to authorized run ids;
- refresh step hydration is scoped only to authorized run ids;
- failed evidence has precedence over running and waiting evidence;
- running evidence has precedence over waiting evidence;
- missing step evidence cannot create a completion percentage or execution pulse;
- step ordering is deterministic by `step_order` then `attempt`;
- failed refreshes do not replace the current evidence snapshot with an error payload;
- refresh polling remains bounded at five seconds;
- observability cannot trigger worker execution;
- no random, fake, or simulated progress path exists.

## Unit and contract testing

Required automated checks:

- `node --test scripts/test-job-monitor-neural-progress.mjs`
- `node scripts/audit-job-monitor-neural-progress-adversarial.mjs`
- `node scripts/test-job-monitor-domain-consistency.mjs`
- existing radial topology and domain-cell contract suites.

The Job Monitor Domain Consistency workflow now runs on both pull requests and pushes to `main`, preventing a post-merge coverage gap.

## Negative and failure cases

| Case | Expected behavior |
| --- | --- |
| Unauthorized run exists | run and its steps are absent from monitoring response |
| Selected run has no step evidence | no Execution Pulse and no fabricated completion percentage |
| Failed step plus running step | neural evidence state is FAILED |
| Running step plus waiting step | neural evidence state is RUNNING |
| Waiting approval step | waiting state and dashed edge |
| Refresh endpoint returns non-2xx | current snapshot remains displayed; no destructive overwrite |
| Empty visible run set | step query is not executed and empty evidence is returned |
| Never-executed feature | grey null-backed feature cell; no synthetic run |
| Repeated attempts | deterministic order by step order then attempt |
| Worker endpoint reference introduced | adversarial audit fails |
| Random/simulated progress introduced | adversarial audit fails |

## Production acceptance

Production is accepted only when:

- exact-main CI is green;
- governed Vercel deployment promotes the certified SHA;
- `/api/build-info` reports that SHA with `environment=production` and `platform=vercel`;
- authenticated `/monitoring` loads without console/runtime failure;
- persisted running, waiting, failed, and completed evidence is represented correctly;
- runs without step evidence do not display fabricated pulse progress.

## Gaps found and fixed

1. **Post-merge monitoring workflow coverage gap.** The Job Monitor Domain Consistency workflow previously ran for pull requests and manual dispatch only. It now also runs on pushes to `main`.
2. **No dedicated neural-progress adversarial audit.** Added `scripts/audit-job-monitor-neural-progress-adversarial.mjs` and wired it into the monitoring workflow.
3. **Authorization-to-step-evidence boundary was not independently asserted.** The new audit verifies both server render and refresh API derive step ids only from authorized runs.
4. **Negative refresh and synthetic-progress boundaries lacked a dedicated independent guard.** The new audit asserts non-2xx refresh preservation, bounded polling, no worker execution, and no synthetic/random progress.

## Remaining external acceptance item

Production visual acceptance is performed after the governed Vercel production workflow promotes the certified exact SHA. This is deployment verification, not an implementation gap.
