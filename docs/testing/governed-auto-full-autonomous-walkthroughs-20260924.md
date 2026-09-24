# GOVERNED_AUTO and FULL_AUTONOMOUS on-screen E2E walkthroughs

## Scope and release boundary

This change adds evidence-gated, seven-phase operator walkthroughs for the two existing autonomy modes, alongside GUIDED. It deliberately **does not** alter the existing orchestration dispatch rules, approve a run, increase budgets, enable auto-remediation, perform an independent certification or deploy production changes.

The walkthroughs are computed from the selected project, the *persisted* policy, real project execution permissions, the current mode's persisted run ID/status, the canonical 75-capability ledger summary and the independent assessment state. Selecting a different mode cannot inherit a prior run's approval, execution results or PASS.

## Operator journey by mode

| Phase | GOVERNED_AUTO | FULL_AUTONOMOUS | Checkpoint |
|---|---|---|---|
| 1 | Select project | Select project | Authorized project selected |
| 2 | Review policy | Set autonomy bounds | Exact chosen mode persisted and enabled, stop clear, no unsaved edits |
| 3 | Define objective | Define objective | agent.execute access and nonempty objective |
| 4 | Submit run | Submit run | Current mode's actual persisted run exists |
| 5 | Human oversight | Monitor agents | Real QUEUED/RUNNING/WAITING_APPROVAL or failure status |
| 6 | Review evidence | Review evidence | Only a real SUCCEEDED run can enter evidence review |
| 7 | Independent certification | Independent certification | Exactly 75 executed and 75 independently verified, certification eligible, then actual PASS |

Approval requirements are policy- and action-dependent in both modes; the walkthrough never fabricates or automatically grants approval. Failed, cancelled, externally blocked and policy-blocked runs remain at a visible failure step. Missing or unknown state remains at monitoring.

## Current source-scoping limitation — important

GUIDED has an optional explicitly enumerated source scope. As implemented in `lib/orchestration/governance-orchestrator-service-v2.ts`, the two autonomous modes instead attach the latest versions of all ACTIVE project datasets when they exist, and block when none is available. Thus a governance-only objective in an autonomous mode **is not yet guaranteed dataset-independent at runtime**, and a selected individual source in the UI must not be represented as constraining autonomous dispatch.

The new mode-specific coach displays this limitation at all times. The run control requires explicit acknowledgment of current project-wide dataset behavior; this is a user-experience safeguard, **not a server-side scope authorization mechanism**. The user must re-confirm after changing the project, mode, goal or saved policy. Existing server-side project authorization and autonomy policy enforcement remain authoritative.

Supporting arbitrary explicit dataset-version selection, no-dataset autonomous objectives and immutable approved-scope snapshots requires a separate runtime change with positive and adversarial tests. Do not imply those capabilities were delivered by this UI-only change.

## Live policy and cost boundary

No project policy was changed. The existing deployment and zero execution/model budget values remain untouched. A zero budget warning does not grant permission to spend. An active emergency stop or unsaved policy must block the UI run; server-side policy must independently revalidate on request and resume.

## Validation

1. Unit state and failure-path tests: `node --experimental-strip-types --test scripts/test-autonomous-governance-journey.mjs`.
2. UI and scope tests: `node --test scripts/test-autonomous-governance-journey-ui.mjs`.
3. Existing GUIDED, execution-mode safety, accessibility and native governance workflow checks must remain green.
4. Independent adversarial review: cross-mode stale success; self-approval; wrong project; stop toggling; goal edits after scope acknowledgment; missing/malformed numeric evidence; zero budget; false certification eligibility; stale server response.
5. After reviewed merge and permission-safe deployment: conduct real signed-in admin and independent approver/certifier journeys, real Job Monitor inspection, and every visible navigation/button/accessibility/failure path. Do not claim this has happened based on CI.

## Deployment

This implementation is a separate dependent pull request, based on PR #1039's branch to avoid unrelated changes to `main` and reduce deployment churn. Merge or retarget only after the GUIDED base and all relevant checks are accepted.
