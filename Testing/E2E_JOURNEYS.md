# Golden End-to-End Journeys

## Certification journeys

1. CSV onboarding to profiling to findings to quality score to governance insight.
2. Database table onboarding to schema discovery to profiling.
3. Object-storage onboarding to profiling and governance.
4. Sensitive-data detection to classification to policy/control.
5. CDE quality failure to remediation to reprofile.
6. Schema drift to lineage impact and governance review.
7. Governed autonomous run to risk evaluation to approvals to exact resume to evidence.
8. Approval authority assignment/delegation to UI refresh to decision.
9. Agent recommendation to human handoff.
10. Failure during execution to safe recovery/retry.
11. Cross-project access attempt to explicit denial.
12. Deployment to production smoke to synthetic journey to reconciliation.

## E2E rule

Critical journeys use production-equivalent UI and real integration boundaries. Each journey records exact commit/deployment, actor/persona, inputs, run/request IDs, fingerprints, API result, authoritative DB/storage state, audit evidence, and final UI state.


## Unattended execution requirement

Every golden journey must execute end to end without human clicks. Automated browser identities perform UI interactions, approval personas are exercised by the harness, waits use deterministic state/event polling rather than operator observation, and all assertions are machine evaluated. Approval workflow tests use synthetic authorized personas and test-scoped authority; they do not bypass separation of duties.
