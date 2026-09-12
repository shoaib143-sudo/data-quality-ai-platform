# Production Architecture, Governance and Remediation Checkpoint

**Date:** 2026-09-13 (Asia/Singapore)  
**Status:** Accepted checkpoint for merged production work; open PR items remain validated branch work only  
**Repository:** `shoaib143-sudo/data-quality-ai-platform`  
**Checkpoint main SHA:** `8618943a9f12add199c2a8156bf998d3ff8ec2e3`

## Purpose

This document records the architecture-significant work performed during the 2026-09-13 Singapore engineering window. It intentionally distinguishes implementation, testing, merge, deployment and production verification.

For this checkpoint, the Singapore day begins at 2026-09-12 16:00 UTC. The relevant pull requests are #351 through #356.

The day concentrated on four architecture themes:

1. keeping UI presentation aligned with governed backend contracts;
2. binding production verification to the deployed compiled artifact rather than source state alone;
3. making human remediation navigation respect every applicable authorization boundary without widening permissions;
4. strengthening the rule that production verification is an engineering gate, not a ceremonial post-deploy check.

## Lifecycle truth at checkpoint

| PR | Change | Tested | Merged | Deployed | Production verified |
|---|---|---|---|---|---|
| #351 | Align catalog lifecycle editor with governed API contract | Yes, dedicated contract plus protected CI green | No | No | No |
| #352 | Hide resolve action for terminal governed issues | Yes, dedicated contract plus protected CI green | No | No | No |
| #353 | Bind production releases to deployed artifact digest | Yes | Yes, merge `8fb619885bdf8e2e8acf555df2b786ab9fe55a35` | Yes | Yes for deployed-artifact provenance contract |
| #354 | Add governed Data Quality presentation contract | Yes, dedicated contract plus protected CI green | No | No | No |
| #355 | Fix governed human remediation handoff | Yes | Yes, merge `6952b74644b0905733e1116b6ffb98a71db1c3e8` | Yes | Production verification exposed a remaining workspace-access defect, so #355 alone is not the final production state |
| #356 | Honor workflow workspace policy in remediation handoff | Yes, including negative and adversarial checks | Yes, merge `8618943a9f12add199c2a8156bf998d3ff8ec2e3` | Yes | Yes for the reproduced Senior Leadership failure case |

The three open PRs were CI-green on their recorded heads, but they are not part of production state and must be rebased or otherwise reconciled with current `main`, then revalidated on their final exact heads before merge.

## Architecture decisions reinforced today

### 1. Governed backend contracts remain the final authority for UI vocabulary and actions

Several final UI and architecture audit findings had the same root pattern: the UI presented a state, action or payload shape that did not exactly match the governed backend contract.

The architectural rule is now explicit:

```text
Authoritative contract
  -> authorized server operation
  -> deterministic presentation adapter
  -> UI control or representation
```

The UI must not create a parallel lifecycle vocabulary, advertise an action that the API cannot or should not perform, or expose raw persisted implementation structures as user-facing business content.

This principle is represented by three current PRs:

- **PR #351** replaces the unsupported catalog UI state `ARCHIVED` with API-supported `RETIRED`. The server-side `catalog.update` capability and lifecycle allowlist remain authoritative.
- **PR #352** classifies `RESOLVED` and `CLOSED` as terminal for the issue-card resolution action and hides `Resolve with evidence` in those terminal states. It does not alter the authorized status-control path, API allowlist or resolution evidence enforcement.
- **PR #354** introduces a presentation contract for Data Quality output. Missing score evidence is rendered as `N/A`, persisted recommendations are type-checked and humanized, `approval_required` remains visible, and raw JSON/internal finding identifiers are not presented as business copy.

All three heads passed their dedicated regression workflows and the broader protected repository checks. They remain open and therefore must not be described as merged, deployed or production-verified.

### 2. Production verification is bound to a deployed artifact, not only a source commit

PR #353 closed a release-evidence gap. A source commit and successful CI prove what was reviewed and built in CI, but they do not by themselves identify the exact compiled artifact served by production.

The deployed-artifact provenance design adds:

- a deterministic SHA-256 digest over the compiled Vercel deployment artifact scope;
- binding to `VERCEL_DEPLOYMENT_ID` and `VERCEL_GIT_COMMIT_SHA`;
- explicit artifact classification, with production classification available only to Vercel production builds;
- a non-secret static provenance manifest at `/.well-known/deployed-artifact-provenance.json`;
- fail-closed handling for missing or invalid deployment identity;
- symlink rejection in digest scope;
- exclusion of the provenance manifest itself from the digest to avoid self-reference;
- preservation of the existing signed reference-build provenance pipeline as a separate control.

This establishes the release-verification chain:

```text
Reviewed source SHA
  -> exact-head CI
  -> compiled deployment artifact
  -> deployment ID + source SHA + artifact digest
  -> production behavioral verification
```

Later production deployment of #356 exercised this mechanism. The final checkpoint production artifact is:

- deployment: `dpl_9GhKAbYHvtG6AV4hr4NjD6zBgJir`;
- environment: `production`;
- source SHA: `8618943a9f12add199c2a8156bf998d3ff8ec2e3`;
- artifact class: `PRODUCTION_DEPLOYMENT`;
- artifact digest: `sha256:81e652fa7cf1e33629fadd32f344e9b3b6bf00900095868542af5a12ecce26fe`;
- artifact file count: `2998`;
- artifact bytes: `49134142`.

The architectural consequence is important: future production acceptance should cite both the source identity and deployed artifact identity when that evidence is available.

### 3. A remediation link is valid only when every required access boundary is satisfied

The initial human remediation defect was that the autonomous Data Quality experience routed users into the Governance Workflows workspace even when they did not have the capability required to act there.

PR #355 introduced a deterministic human-remediation handoff resolver. It used the canonical `DATA_QUALITY_REMEDIATION_APPROVAL` authority boundary, whose approval capability is `policy.approve`.

The intended decision was:

```text
workflow exists?
  no  -> governed issue tracking
  yes -> has policy.approve?
           no  -> governed issue handoff
           yes -> approval workflow
```

It also added negative cases for unauthorized users, blank workflow identifiers and workflows that do not require approval, plus an independent automated adversarial audit wired into the autonomous-governance verification path.

Production verification after #355 then found a second independent boundary. The authenticated Senior Leadership production session had project-level `policy.approve`, but the persona was intentionally denied the `workflows` workspace. The UI therefore offered `Open approval workflow`, but the route correctly failed at the layout-level workspace gate and redirected to access denied.

This was not fixed by weakening the workspace policy. PR #356 changed the handoff decision to satisfy both existing gates:

```text
workflow exists?
  no  -> governed issue tracking
  yes -> has project policy.approve?
           no  -> governed issue handoff
           yes -> has workflow workspace access in current governance context?
                    no  -> governed issue handoff
                    yes -> focused approval workflow
```

The resulting architecture rule is:

> Navigation to a governed operator workspace must require both the action capability and the independent workspace/context access required to reach that workspace. Possession of one does not imply the other.

This preserves the existing authorization model:

- no persona permission was widened;
- no RLS policy was weakened;
- no workflow capability was broadened;
- no production mutation permission changed;
- the Data Quality remediation API approval gate remained authoritative;
- `production_mutation_performed: false` remained unchanged for the governed remediation flow.

### 4. UI visibility is not an authorization control

Today reinforced a repeated DataNexus architecture principle: hiding a link is a usability and safety improvement, but server-side authorization remains mandatory.

The remediation work therefore does both:

- presentation/navigation avoids offering a route that the user cannot use;
- `/workflows` continues to enforce its own workspace gate;
- workflow actions continue to enforce project capability on the server.

This pattern prevents two failure modes:

1. false affordance, where the UI sends a user into an inaccessible experience;
2. security regression, where the team attempts to make the false affordance work by broadening access.

### 5. Unknown and future states should fail closed in presentation logic

The open UI-contract PRs and the remediation work all apply the same future-state posture:

- unsupported lifecycle states are not advertised;
- terminal issue behavior is explicit rather than inferred from a permissive default;
- unknown score/recommendation payload states do not leak raw structures;
- missing or ambiguous workflow access does not route to a privileged workspace;
- blank workflow identifiers do not produce workflow navigation.

Presentation code is therefore treated as part of the governed contract surface even when it does not itself confer authority.

### 6. Independent automated adversarial audits are part of acceptance

The work today continued the project standard that normal positive-path tests are insufficient for governance-sensitive changes.

Relevant adversarial checks covered:

- deployed artifact identity spoofing and preview-to-production escalation;
- artifact tampering, self-reference, symlink substitution and secret extraction attempts;
- unauthorized or cross-context remediation routing;
- approval capability without workflow workspace access;
- explicit preservation of the Senior Leadership workflow restriction;
- terminal issue action exposure and ambiguous verification authority;
- raw Data Quality payload leakage and approval-boundary preservation;
- catalog lifecycle authorization ordering and unsupported future states.

The final #356 exact head passed the Quality Gate, P0-P5 revalidation, V6 operational certification, CodeQL, dependency audit, Persona Workspace Policy, Navigation Integrity, AI Production Boundaries and AI red-team workflows before merge.

## Production verification result for the remediation defect

The exact production failure was re-tested after #356 on the production deployment bound to merge SHA `8618943a9f12add199c2a8156bf998d3ff8ec2e3`.

For the authenticated Senior Leadership session:

- the global `Approvals` navigation entry was not shown;
- approval-required Data Quality investigations displayed `Track remediation issue`;
- the handoff target was `/issues`, not `/workflows`;
- the guidance explicitly stated that the user had approval authority but the Governance Workflows workspace was unavailable in the current governance context;
- the guidance directed coordination with an authorized workflow operator;
- `/data-quality/autonomous` returned HTTP 200 on the new production deployment.

The positive path, where both `policy.approve` and workflow-workspace access are present, is covered by deterministic unit and adversarial tests. A production role was not modified merely to manufacture that persona for a live positive-path test.

## Engineering incidents caught before final merge

Two intermediate build problems are worth preserving because they demonstrate why exact-head validation matters.

### PR #355 accidental dependency drift

While wiring the new handoff unit test into `package.json`, an unrelated `tw-animate-css` version change was introduced accidentally. That intermediate preview failed. The drift was detected, reverted and the final PR diff was rechecked before merge.

The lesson is that even small verification-script edits require a final diff review for unrelated dependency or lockfile movement.

### PR #356 intermediate call-site mismatch

During the follow-up workspace-gate change, intermediate preview commits temporarily had a changed resolver signature before the page call site was fully aligned. Those previews failed. The final head `cdc0a497deca2124131dd73da8f177f662483e8e` compiled, deployed to preview and passed the full CI set before merge.

Intermediate failed previews are not release failures when they are corrected before the verified head, but they should remain visible in engineering history rather than being silently ignored.

## Open branch work at the checkpoint

### PR #351 - catalog lifecycle contract

Head: `6de4fcb578988cdfa908b268f129095ec3599894`  
State: open, mergeable at capture time  
Validation: `Catalog lifecycle contract` passed; Quality Gate, P0-P5, V6, CodeQL, dependency audit, AI boundaries, red-team, navigation and other repository checks passed.

Required before release:

1. reconcile with current `main`;
2. rerun exact-head checks;
3. merge only after final-head gates are green;
4. deploy from the exact merge SHA;
5. production-verify that the lifecycle selector advertises only API-supported states without performing a production mutation.

### PR #352 - terminal issue resolution action

Head: `ee768611bfafc91911bdca5b75b86e78adcea602`  
State: open, mergeable at capture time  
Validation: `Terminal issue resolution UI` passed; Quality Gate, P0-P5, V6, CodeQL, dependency audit, AI boundaries, red-team, persona/workspace, navigation and related checks passed.

Required before release:

1. reconcile with current `main`;
2. rerun exact-head checks;
3. merge and deploy from the exact verified head/merge lineage;
4. production-verify that terminal issues do not show `Resolve with evidence` while authorized comments and intentional status controls remain available.

### PR #354 - Data Quality presentation contract

Head: `ff985be1685b5e7b3c4b03869f7be5eba76beec1`  
State: open, mergeable at capture time  
Validation: `Data quality presentation contract` passed; Quality Gate, P0-P5, V6, CodeQL, dependency audit, AI boundaries, red-team, navigation and related checks passed.

Required before release:

1. reconcile with current `main`;
2. rerun exact-head checks;
3. merge and deploy only after final-head validation;
4. production-verify `N/A` for absent score evidence, human-readable recommendations, visible approval requirements and absence of raw JSON/internal finding identifiers.

## Separate production observation not addressed by this checkpoint

While inspecting runtime logs after the #356 deployment, `/admin/ai-command-center/retrieval-evaluation` returned HTTP 500 because access to `ai_retrieval_evaluation_case_effective` was denied.

This error was not on the remediation path and was not modified as part of #355/#356. It should be investigated as a separate authorization/runtime issue rather than mixed into the completed remediation fix.

## Resulting architecture baseline

At the end of this checkpoint, DataNexus follows these release and remediation rules:

1. deterministic policy/verifier logic remains final authority;
2. presentation must conform to governed backend contracts;
3. action capability and workspace/context access are independent gates;
4. security findings are not fixed by broadening permissions;
5. unknown and future presentation states fail closed;
6. every governance-sensitive change requires positive, negative/failure and adversarial validation;
7. production verification must exercise the deployed behavior, and where available must be bound to deployment ID, source SHA and compiled-artifact digest;
8. a failed production verification reopens the lifecycle even when merge, CI and deployment were successful.

## Related pull requests

- [#351 Align catalog lifecycle editor with governed API contract](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/351)
- [#352 Hide resolve action for terminal governed issues](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/352)
- [#353 Bind production releases to deployed artifact digest](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/353)
- [#354 Add governed Data Quality presentation contract](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/354)
- [#355 Fix governed human remediation handoff](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/355)
- [#356 Honor workflow workspace policy in remediation handoff](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/356)

## Cross reference

The chronological engineering discussion, validation history, production finding and continuation plan are recorded in:

- `Major discussion/2026-09-13-engineering-summary-production-verification-and-next-work.md`
