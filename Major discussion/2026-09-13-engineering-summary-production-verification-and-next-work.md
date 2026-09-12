# Engineering Summary, Production Verification and Next Work

**Date:** 2026-09-13 (Asia/Singapore)  
**Scope:** DataNexus AI work performed during the 2026-09-13 Singapore engineering day  
**Repository:** `shoaib143-sudo/data-quality-ai-platform`  
**Current production merge SHA at checkpoint:** `8618943a9f12add199c2a8156bf998d3ff8ec2e3`

## Why this record exists

The work today was not one isolated feature. It was a final architecture, UX, release-evidence and production-verification pass across several governed surfaces.

The most important outcome was not simply that multiple PRs were written. The session demonstrated a repeatable DataNexus engineering pattern:

1. inspect production and compare it with design, architecture and governed contracts;
2. express each mismatch as a narrow deterministic defect;
3. fix the presentation or routing layer without weakening backend authority;
4. add unit, contract, negative/failure and independent adversarial checks;
5. require exact-head protected CI;
6. merge and deploy only after the tested head is known;
7. perform authenticated production verification;
8. if production verification reveals another boundary, reopen the lifecycle and fix that boundary rather than declaring success early.

## Work completed today

The Singapore-day PR sequence was #351 through #356.

### PR #351 - catalog lifecycle UI/API contract alignment

**State at checkpoint:** open, tested, not merged, not deployed, not production-verified.  
**Head:** `6de4fcb578988cdfa908b268f129095ec3599894`

The production UI/architecture audit found that the catalog lifecycle editor advertised `ARCHIVED`, but `PATCH /api/catalog/[datasetId]` accepts `DRAFT`, `ACTIVE`, `DEPRECATED` and `RETIRED`.

The correction replaces the unsupported UI option with the API-supported `RETIRED` state while preserving the existing server-side `catalog.update` capability and lifecycle allowlist.

The work includes:

- a static UI/API lifecycle contract;
- negative/future-state checks;
- an independent adversarial audit verifying authorization and lifecycle validation ordering;
- a dedicated `Catalog lifecycle contract` CI workflow.

The dedicated workflow and the broader Quality Gate, P0-P5 revalidation, V6 certification, CodeQL, dependency audit, navigation, persona/workspace and AI security workflows passed on the recorded head.

Because the PR remains open, none of this is production state yet.

### PR #352 - terminal issue resolution action

**State at checkpoint:** open, tested, not merged, not deployed, not production-verified.  
**Head:** `ee768611bfafc91911bdca5b75b86e78adcea602`

The final production UI/architecture audit found `Resolve with evidence` still visible for issues already in terminal `RESOLVED` state. Reusing that control could repeat governed resolution processing, rewrite resolution evidence and invoke verification logic again.

The correction:

- treats `RESOLVED` and `CLOSED` as terminal for the resolve-with-evidence form;
- hides only that terminal resolution form;
- keeps comments and explicit authorized status controls intact, including intentional reopen/close workflows;
- leaves API authorization, deterministic status allowlists, resolution evidence rules and verification authority unchanged.

The work includes a UI/API contract, negative-state coverage, independent adversarial audit and dedicated `Terminal issue resolution UI` workflow. The dedicated workflow and protected repository checks passed on the recorded head.

This remains branch work until merged, deployed and production-verified.

### PR #353 - deployed artifact provenance

**State at checkpoint:** merged, deployed and production-verified for the release-provenance contract.  
**Merge SHA:** `8fb619885bdf8e2e8acf555df2b786ab9fe55a35`

This was the major release-engineering change of the day.

Before #353, DataNexus could identify reviewed source, CI results and a Vercel deployment, but the production-verification story did not cryptographically bind the exact compiled deployment contents to the source identity.

The change added a deterministic deployed-artifact provenance contract:

- SHA-256 digest of the compiled artifact scope;
- binding to Vercel deployment ID and Git source SHA;
- explicit production versus non-production artifact classification;
- non-secret manifest at `/.well-known/deployed-artifact-provenance.json`;
- fail-closed handling of missing/invalid deployment identity;
- symlink rejection;
- manifest self-exclusion from its own digest;
- independent adversarial tests for spoofing, preview escalation, artifact tampering, self-reference, symlink substitution and secret extraction.

This changed the meaning of production verification. DataNexus can now record not only "this source SHA was merged" but also "this exact compiled artifact, with this digest, was served by this production deployment."

The later #356 production release exercised this contract and produced:

- deployment `dpl_9GhKAbYHvtG6AV4hr4NjD6zBgJir`;
- source SHA `8618943a9f12add199c2a8156bf998d3ff8ec2e3`;
- artifact class `PRODUCTION_DEPLOYMENT`;
- digest `sha256:81e652fa7cf1e33629fadd32f344e9b3b6bf00900095868542af5a12ecce26fe`;
- 2,998 artifact files;
- 49,134,142 artifact bytes.

### PR #354 - governed Data Quality presentation contract

**State at checkpoint:** open, tested, not merged, not deployed, not production-verified.  
**Head:** `ff985be1685b5e7b3c4b03869f7be5eba76beec1`

The production UI/design audit found two user-facing truth/presentation defects on `/data-quality`:

1. absent accuracy evidence was rendered as literal `null`;
2. persisted recommendation objects were rendered as raw JSON, including implementation payload structure and internal finding identifiers.

The branch introduces an explicit presentation adapter:

- missing score evidence uses the existing `N/A` convention;
- recommendation objects are type-checked and humanized;
- action, rationale and priority are presented as user-facing content;
- `approval_required` stays visible as `APPROVAL REQUIRED`;
- raw JSON and internal finding-ID arrays are not rendered as recommendation copy;
- the governed issues destination and backend evidence remain unchanged.

The dedicated `Data quality presentation contract` workflow, protected Quality Gate, P0-P5, V6, CodeQL, dependency audit, AI boundaries, navigation and red-team workflows passed on the recorded head.

It is not production state until it is reconciled with current `main`, revalidated, merged, deployed and production-verified.

### PR #355 - first governed human remediation handoff repair

**State at checkpoint:** merged and deployed, but its first production verification exposed a remaining defect. It is therefore not the final remediation state.  
**Merge SHA:** `6952b74644b0905733e1116b6ffb98a71db1c3e8`

The handoff defect was traced to `app/data-quality/autonomous/page.tsx`. Approval-backed investigations exposed `/workflows` links even when the user did not have approval authority.

The canonical Data Quality approval workflow is `DATA_QUALITY_REMEDIATION_APPROVAL`, whose active approval step uses `policy.approve`. The initial fix therefore:

- added a deterministic human remediation handoff resolver;
- checked `policy.approve` per visible project using existing server-side authorization helpers;
- showed a focused workflow link only to users with approval capability;
- routed non-approvers to `/issues` with explicit governed handoff guidance;
- suppressed the global Approvals navigation when the user had no approval authority for visible investigations;
- added unit cases for authorized, unauthorized, blank-workflow and no-workflow states;
- added a separately written automated adversarial audit and wired it into `verify:autonomous`.

#### Intermediate dependency drift caught

While wiring the unit test into `package.json`, an unrelated `tw-animate-css` version change was accidentally introduced. That intermediate preview failed.

The change was detected during diff/build review, reverted, and the final PR diff was checked to confirm the dependency remained unchanged. This is an important assurance event because it proves final-diff review caught an unrelated mutation before merge.

#### #355 CI and merge

The final #355 head passed the repository's Quality Gate and broad security/revalidation workflows, including the new handoff-specific automated adversarial audit. It was merged and deployed.

#### Production verification reopened the lifecycle

Authenticated production testing then found a second access boundary that the first design had not modeled.

The Senior Leadership production session had `policy.approve`, so the page correctly believed the user could approve at project level. However, Senior Leadership was intentionally excluded from the Governance Workflows workspace by persona/workspace policy.

The result was:

```text
policy.approve = true
workflow workspace access = false
UI offers Open approval workflow
/workflows layout correctly denies entry
user reaches access-denied
```

That production result meant the original user journey was still defective. The correct response was not to call #355 complete, and not to grant Senior Leadership more access. A second repair was required.

### PR #356 - combined capability and workspace-aware remediation handoff

**State at checkpoint:** implemented, tested, adversarially audited, CI-green, merged, deployed and production-verified for the reproduced failure case.  
**Head before merge:** `cdc0a497deca2124131dd73da8f177f662483e8e`  
**Merge SHA:** `8618943a9f12add199c2a8156bf998d3ff8ec2e3`

The root cause was confirmed in code: `/workflows` has a layout-level workspace gate independent of the project action capability. `policy.approve` and access to the Governance Workflows workspace are distinct controls.

The final routing contract became:

```text
workflow required?
  no -> issue tracking
  yes -> project policy.approve?
           no -> governed issue handoff
           yes -> workflow workspace available in current governance context?
                    no -> governed issue handoff
                    yes -> focused workflow instance
```

The branch added:

- the second workspace/context gate to remediation navigation;
- a negative unit case for `policy.approve = true` with workflow workspace unavailable;
- adversarial assertions that both gates are required;
- an explicit assertion that Senior Leadership is not granted `workflows` as a workaround;
- preservation of the backend approval gate and `production_mutation_performed: false` invariant.

Intermediate preview commits briefly failed while the helper signature and call site were being aligned. The final head compiled successfully, produced a READY preview and passed the full required CI set.

The final head passed:

- Quality Gate;
- autonomous governance verification;
- production build;
- production HTTP SLO smoke benchmark;
- JDBC validation;
- P0-P5 revalidation;
- V6 operational certification including clean database reconstruction;
- CodeQL Security;
- Dependency Security Audit;
- Persona Workspace Policy;
- Navigation Integrity;
- AI Production Boundaries;
- AI Red Team Assurance and measured evidence;
- Production Security Posture;
- Release Governance.

## Final production verification

PR #356 merged to `main` as `8618943a9f12add199c2a8156bf998d3ff8ec2e3`.

Vercel then produced production deployment `dpl_9GhKAbYHvtG6AV4hr4NjD6zBgJir` from that exact source SHA. The deployment reached `READY`, and its compiled artifact provenance recorded the SHA-256 digest listed above.

The exact Senior Leadership failure case was then repeated in the authenticated production UI.

Observed behavior after the fix:

- no global `Approvals` link was presented in the autonomous Data Quality navigation;
- approval-required investigations displayed `Track remediation issue`;
- the link destination was `/issues`;
- guidance stated: the user has approval authority, but the Governance Workflows workspace is not available in the current governance context;
- guidance instructed the user to coordinate approval with an authorized workflow operator;
- the UI no longer offered the inaccessible focused `/workflows` route;
- `/data-quality/autonomous` returned HTTP 200 on the exact production deployment.

The authorized positive path is covered by deterministic unit/adversarial tests. Production roles were not changed merely to manufacture an additional live persona test.

## Major decisions made during the session

### Do not weaken security to repair UX

The most important decision from the remediation investigation was to keep both authorization controls intact.

Senior Leadership having project approval authority did not imply it should receive access to the operator workspace. The fix therefore changed navigation and guidance, not the workspace policy.

This preserves a key DataNexus principle:

> A UX dead end is repaired by representing the real governed handoff, not by granting extra authority so the original link becomes reachable.

### Deterministic presentation contracts are governance infrastructure

The catalog, issue and Data Quality audit findings show that presentation logic can create governance defects even when backend authorization remains correct.

A deterministic presentation contract should define:

- supported state vocabulary;
- terminal/non-terminal action visibility;
- representation of missing evidence;
- safe transformation of persisted structured recommendations;
- approval labels and authority cues;
- fail-closed handling for unknown states.

The browser should not become a second source of governance truth.

### Production verification can invalidate an otherwise green release

#355 had implementation, unit tests, automated adversarial tests, broad CI, merge and successful deployment. It still failed the target production user journey because another independent access boundary existed in the live system.

That is not a reason to distrust automated tests. It is evidence that the lifecycle model is correct: automated assurance and production verification solve different problems.

The session therefore reinforced this status sequence:

```text
implemented
  != tested
  != merged
  != deployed
  != production-verified
```

If production verification fails, the lifecycle returns to defect analysis even when every previous stage was green.

### Compiled-artifact identity should accompany production evidence

The provenance work means future release evidence should prefer:

```text
merge/source SHA
+ deployment ID
+ environment classification
+ compiled artifact digest
+ behavioral verification evidence
```

This gives future agents and reviewers a stronger answer to "what exactly was tested in production?"

## Open work requiring continuation

Three PRs from today's audit remain open: #351, #352 and #354.

Their recorded heads were CI-green, but current `main` has advanced through #353, #355 and #356. Before merging any of them, the next engineering pass should reconcile each branch with exact current `main` and rerun all affected exact-head checks.

Recommended order:

1. **PR #351 - catalog lifecycle contract**
   - reconcile with `main`;
   - rerun dedicated and protected checks;
   - merge if clean;
   - production-verify selector vocabulary without mutating a production dataset.
2. **PR #352 - terminal issue action**
   - reconcile with the latest issues/remediation UI;
   - rerun terminal-state contract/adversarial checks;
   - merge if clean;
   - production-verify that `RESOLVED` and `CLOSED` issues do not show `Resolve with evidence`, while authorized comments/status controls remain intact.
3. **PR #354 - Data Quality presentation contract**
   - reconcile with the remediation handoff changes now on `main`;
   - rerun presentation, autonomous-governance and navigation tests together;
   - merge if clean;
   - production-verify `N/A`, human-readable recommendations, approval labels and absence of raw JSON/internal IDs.

The order above minimizes overlap risk because #354 touches the broader Data Quality presentation surface and should be validated against the final remediation navigation now in production.

## Separate production issue observed but not fixed in this session

After the final #356 production deployment, runtime-log inspection showed:

`GET /admin/ai-command-center/retrieval-evaluation` -> HTTP 500

The server error reported permission denied for view `ai_retrieval_evaluation_case_effective`.

This was outside the remediation path and was deliberately not folded into #356. It should be investigated separately with its own authorization analysis, tests, adversarial review and lifecycle evidence.

## Current production checkpoint

At the end of this record:

- current documented production merge SHA: `8618943a9f12add199c2a8156bf998d3ff8ec2e3`;
- final remediation production deployment: `dpl_9GhKAbYHvtG6AV4hr4NjD6zBgJir`;
- deployed artifact digest: `sha256:81e652fa7cf1e33629fadd32f344e9b3b6bf00900095868542af5a12ecce26fe`;
- governed human remediation failure reproduced before #356: yes;
- same Senior Leadership case verified after #356: yes;
- permissions widened to obtain the result: no;
- production remediation mutation performed as part of this UX verification: no;
- open audit PRs still awaiting merge: #351, #352, #354.

## Pull request register

| PR | Title | Checkpoint status |
|---|---|---|
| [#351](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/351) | Align catalog lifecycle editor with governed API contract | Open, CI-green head, not deployed |
| [#352](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/352) | Hide resolve action for terminal governed issues | Open, CI-green head, not deployed |
| [#353](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/353) | Bind production releases to deployed artifact digest | Merged and production exercised |
| [#354](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/354) | Add governed Data Quality presentation contract | Open, CI-green head, not deployed |
| [#355](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/355) | Fix governed human remediation handoff | Merged/deployed, but production verification found a remaining workspace gate |
| [#356](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/356) | Honor workflow workspace policy in remediation handoff | Merged, deployed and reproduced-case production-verified |

## Continuation prompt for the next engineering agent

Use the following as the durable starting context:

> Continue DataNexus AI from production merge SHA `8618943a9f12add199c2a8156bf998d3ff8ec2e3`. The governed human remediation handoff is production-verified for the previously failing Senior Leadership case after PR #356. Do not weaken `policy.approve`, workspace policy, RLS or backend mutation authority. PRs #351, #352 and #354 were CI-green on their recorded heads but remain open and are based on earlier `main`; reconcile each with current `main`, rerun exact-head dedicated tests, Quality Gate, revalidation, certification, security and adversarial checks, then merge/deploy/production-verify one at a time. Prefer #351, then #352, then #354 because #354 should be checked against the final remediation navigation. Separately investigate the production `/admin/ai-command-center/retrieval-evaluation` 500 caused by permission denial on `ai_retrieval_evaluation_case_effective`; do not mix that authorization repair into unrelated UI PRs. Preserve explicit lifecycle truth: implemented, tested, merged, deployed and production-verified are separate states.

## Architecture cross reference

The architecture implications and resulting baseline are recorded in:

- `Architecture/2026-09-13-production-architecture-governance-and-remediation-checkpoint.md`
