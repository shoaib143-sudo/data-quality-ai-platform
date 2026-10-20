# Profiling native-tool boundary: post-release assurance

Date: 2026-10-20
Scope: PR #1148 only
Production/main SHA: `c5ae583f489cff229964316ef8d1da85a26b92b4`
Production Vercel deployment: `dpl_7fdbjqpaRBH9ijYYLrALJ27gyESP` (READY, alias: `data-quality-ai-platform.vercel.app`)

## Objective and outcome

The production profiling orchestration used to spread `requestInput` (including workflow and learning metadata) into native profiling tool calls. Strict tool admission rejected unexpected fields. PR #1148 now invokes `profile_dataset`, `execute_metrics`, and `investigate_profile` with exactly `datasetVersionId` and `profilingRunId`. Orchestration retains the separate original metadata for workflow logging and bounded learning evidence.

PR #1148 was squash-merged. The exact merged main commit contains only:
- `lib/agents/run-profiling-job.ts`
- `scripts/test-profiling-request-input.mjs`

GitHub checks for the merged main SHA: 55 successful, 5 skipped, zero failures. PR head checks: 57 successful, 18 skipped, zero failures. Deployment alias and exact SHA were verified using the Vercel deployment API.

## Read-only live evidence checked

Supabase production project `tvjnavjxuehpesxcfvrx`:

| Verification | Result |
| --- | --- |
| Active JDBC execution sources | 7 |
| Active FILE execution sources | 3 |
| Active sources without any COMPLETED profile | 0 |
| `pub.gold.customer_water_consumption_behavior` | COMPLETED; 394 rows, 9 columns, 257 metrics, DQ 84.3% |
| `pub.gold.test` | COMPLETED; 2 rows, 1 column, 33 metrics, DQ 100% |
| `pub.gold.water_quality_compliance` | COMPLETED; 60 rows, 18 columns, 509 metrics, DQ 72.22% |
| Negative learning candidates | 5 |
| Positive learning candidates | 1 |
| Positive occurrences | 3 |
| Negative occurrences | 8 |
| Candidates with unsafe auto-apply/self-promotion/expanded authority flags or absent required human review | 0 |
| Learning candidates in REVIEW_REQUIRED | 6 |

Historic FAILED profile runs remain present and were not deleted. Neither any of the three PUB Gold tables nor any other dataset was re-profiled for this assurance review.

For `agent.learning_candidates`, `positive_learning_cases`, `positive_learning_case_occurrences`, `negative_learning_cases`, and `negative_learning_case_occurrences`: row-level security is enabled, and the `authenticated` database role lacks INSERT, UPDATE and DELETE table privileges. An explicit restrictive RLS policy remains on negative occurrence evidence.

An authenticated browser session displayed Data Quality, Profiling Explorer and read-only Learning Governance. Data Quality showed the verified PUB Gold rows/columns and quality scores; Learning Governance showed six candidates, human release review required, no automatic promotion, and zero active releases.

Vercel runtime error aggregation found no errors in the inspected four-hour window. A separate 30-minute deployment-scoped error/fatal log query returned no matching log lines. An attempted four-hour raw-log query exceeded Hobby retention. These observations do **not** establish zero errors outside the available window.

## Independent adversarial code review (read-only)

The reviewer independently fetched the merged main implementation and its executor, not just the PR description:

1. **Input smuggling via `requestInput` into three profiling native tools.** The three actual call sites use the two-field object literals. **Pass, static evidence**.
2. **Forged rows, metrics, findings or scores.** The request-input regression suite asserts that sanitizer removes these untrusted properties. The executor's metric path invokes `executeProfilingMetrics(..., {})` and fetches from registered sources rather than forwarding supplied metric data. **Pass, static evidence and CI**, not a newly executed end-to-end attack.
3. **Readiness bypass.** The native executor enforces deterministic readiness on `profile_dataset` and `execute_metrics` before admission. **Pass, static evidence**. A fresh fault-injection test was **not** run.
4. **Tool admission bypass.** `admitNativeToolInvocation` precedes the operation switch. **Pass, static evidence**. Reauthorization internals were not exhaustively audited in this scoped review.
5. **Cancellation/replay behavior.** The orchestration checks cancellation after native steps, and the executor uses replay-safe wrappers. **Inspected**, but concurrency races and queue retries were **not** dynamically fault-injected during this review.
6. **Learning self-promotion or client-side mutation.** All six candidates require human review, forbidden expansion flags remain false, and the authenticated database role lacks write privileges on five relevant learning tables. **Pass, live snapshot**. Administrative review/approval workflows were intentionally not invoked.

## Automated tests and scope limitations

The existing `scripts/test-profiling-request-input.mjs` regression suite asserts:
- unsupported raw data, metrics, findings, scores, source and project identifiers are removed;
- permitted orchestration context is normalized;
- direct native `executeProfilingMetrics` does not receive raw caller input;
- all three profiling native call sites receive only the permitted identifiers.

The CI runs for PR head and post-merge main both reported zero failing checks. These are pre-existing automated gates. **This review did not independently execute the full suite locally**, conduct randomized runtime fuzzing, simulate database outages, or execute a fresh governed profiling smoke run. A clean CI result alone does not prove each negative/failure case was exercised in production.

## Residual items and release decision

- Code release and live data/UI verification: **complete**.
- Dedicated runtime fault injection for tool admission, cancellation races, retry exhaustion and persistence failure: **open**, for controlled synthetic data and isolated test execution.
- Full independent authorization-path review beyond the inspected call sites: **open**.
- Additional retained risk: leaked-password protection is unavailable on the current Supabase plan; tracked separately as PA-RISK-004, unrelated to PR #1148.
- Production approval and learning-case promotion: **not performed**.

**Scoped conclusion:** no new defect was identified in the verified PR #1148 boundary. The production fix is deployed and supported by exact-SHA CI, read-only database evidence and authenticated UI inspection. Do not label the entire platform adversarially certified until the explicit dynamic fault-injection and broader authorization testing above are performed.

## Follow-up test plan

1. In a controlled synthetic-data environment, submit malformed native tool input with injected `trigger`, `rows`, `metrics`, `score`, `source`, `learningRunMode`, `projectId` and `agentDefinitionId`; assert fail-closed admission and no persisted fabricated metrics.
2. Exercise allowed GUIDED/SUPERVISED profiling through the durable job queue; assert expected persisted evidence without duplicated work on replay.
3. Inject cancellation before and after profile, metrics and investigation steps; assert terminal states, no ungoverned continuation and durable logs.
4. Simulate transient source outage, metric persistence failure and queue retry exhaustion in controlled testing; verify bounded retry, failure evidence and no automatic learning promotion.
5. Test wrong project/user and missing capability at admission and release; assert denial at both boundaries.
6. Independently inspect learning reviewer, evaluator and release assignment separation and authorization at current policy state.
7. Re-run exact-head CI on any new functional fix and validate runtime logs after deployment; avoid repeat PUB Gold profiling absent a justified change.
