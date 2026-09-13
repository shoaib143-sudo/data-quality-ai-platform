# Chat-Derived Architecture Decisions and Authority Boundaries

**Date:** 2026-09-13 (Asia/Singapore)  
**Status:** Current decision synthesis for the reviewed September 13 DataNexus AI project chats  
**Repository baseline reconciled:** `be2fbd45d5692aaef6e73101efefeec352a31aa3`  
**Scope:** Architecture decisions, tradeoffs, authority boundaries, implementation direction, superseded decisions, and unresolved architecture items

## Source and evidence boundary

This record summarizes the DataNexus AI project chats available in the shared project context for September 13, 2026, then reconciles those discussion decisions with the repository state reached later that day.

It records durable project decisions and outcomes. It does not attempt to preserve private model reasoning or hidden chain of thought.

Each item below is classified as one of:

- **CHAT-AGREED:** explicitly established as an engineering or product direction in the reviewed project conversations;
- **REPOSITORY-CONFIRMED:** later implementation or lifecycle evidence visible in GitHub;
- **COMBINED:** a chat-established principle that was subsequently implemented or reinforced in the repository.

## 1. Engineering acceptance is broader than build correctness

**Classification:** CHAT-AGREED, later reflected in repository PR assessment fields.

Final acceptance of the DataNexus UI is not limited to whether the application builds or whether a control technically works.

A final testing pass must evaluate at least:

- functional correctness;
- build/runtime correctness;
- architecture alignment;
- design and presentation correctness;
- governed authorization and authority boundaries;
- agreed product requirements;
- production behavior where relevant.

The review process must capture the output of every check rather than returning only a final pass/fail summary.

Findings should identify their assessment basis, using categories such as:

- `DESIGN`;
- `ARCHITECTURE`;
- `BUILD`;
- `AGREED_REQUIREMENT`;
- `GOVERNANCE_CONTRACT`;
- `PRODUCTION_OBSERVATION`.

This decision was subsequently visible in PRs such as #351, #352 and #354, whose findings explicitly recorded assessment basis and requirement strength.

## 2. Lifecycle states are separate engineering facts

**Classification:** CHAT-AGREED and COMBINED.

DataNexus engineering must never collapse these states into one claim:

```text
implemented
  != tested
  != merged
  != deployed
  != production-verified
```

A successful implementation or CI result is not a production-verification result.

A failed production verification reopens the defect lifecycle even if implementation, automated testing, merge and deployment all succeeded.

This principle was demonstrated directly by the human-remediation sequence: PR #355 passed implementation and CI and was deployed, but production verification exposed an independent workspace-access boundary. PR #356 was required before the reproduced failure case could be considered production-verified.

## 3. Deterministic policy and verifier logic is final authority

**Classification:** CHAT-AGREED and COMBINED.

Where a deterministic policy, contract or verifier exists, presentation logic and AI behavior must defer to it.

Examples reinforced during the day:

- catalog lifecycle vocabulary must come from the governed API contract;
- terminal issue behavior must preserve the deterministic status and evidence contract;
- remediation approval routing must use the canonical project capability and workspace policy;
- persona navigation must use the shared workspace policy rather than infer access from visible page context;
- semantic persona counts must derive from the authoritative persona catalog rather than duplicated copy;
- production release evidence should bind source, deployed artifact identity and behavioral verification.

AI or UI convenience must not override deterministic authority.

## 4. UI presentation is not an authorization mechanism

**Classification:** COMBINED.

A UI control should not advertise an operation that the user cannot actually perform, but hiding a control is not itself a security boundary.

The architecture therefore keeps two independent responsibilities:

```text
Presentation policy
  -> suppress unavailable or misleading actions

Server / route / database authority
  -> enforce whether the operation is actually allowed
```

The day repeatedly rejected the unsafe alternative of making a misleading UI action reachable by widening permissions.

Direct route and server authorization remain authoritative even when presentation has already hidden the action.

## 5. Action capability and workspace access are independent gates

**Classification:** COMBINED.

The initial human-remediation discussion correctly identified that the AI remediation path already refused an approval-gated production change. The remaining defect was the human handoff: it was vague and could route the user into an inaccessible Governance Workflows workspace.

The first implementation model was:

```text
workflow exists
  + project policy.approve
  -> workflow link
```

Production verification proved that this model was incomplete. A user can hold project-level `policy.approve` while their persona or governance context is still denied the `workflows` workspace.

The final architecture is:

```text
workflow exists?
  no  -> governed issue tracking
  yes -> project policy.approve?
           no  -> governed issue handoff
           yes -> workflows workspace allowed in current governance context?
                    no  -> governed issue handoff
                    yes -> focused approval workflow
```

Neither gate implies the other.

The rejected alternative was to grant the persona additional workspace access merely to make the original link work.

## 6. Security findings must not be repaired by weakening permissions

**Classification:** CHAT-AGREED and COMBINED.

The day established a standing rule: do not “fix” a usability, authorization or production failure by broadening permission scope unless the product requirement itself explicitly changes.

This rule applied to:

- remediation workflow access;
- persona workspace links;
- retrieval-evaluation database access;
- physical-asset identity presentation;
- issue resolution actions.

Narrow presentation or read-path corrections are preferred over authority expansion.

## 7. Database access is a composition of app authorization, SQL privileges and RLS

**Classification:** REPOSITORY-CONFIRMED, aligned with the chat-established authority model.

The retrieval-evaluation failure exposed an important architecture boundary.

Application `admin.manage` authorization was already present, but the effective view could not be read because authenticated SQL `SELECT` grants were missing. The correction in PR #358 preserved the full layered model:

```text
Application capability
  + authenticated SQL privilege
  + project-member RLS
  + SECURITY INVOKER view semantics
  -> governed read
```

The chosen correction was intentionally narrow:

- anonymous access denied;
- authenticated users receive `SELECT` only;
- project-member RLS remains the row boundary;
- service role receives explicit read access;
- no authenticated mutation privilege is introduced;
- no `SECURITY DEFINER` bypass is introduced.

### Retrieval evidence authority boundary

Retrieval-evaluation data remains evidence only.

It does not gain authority to:

- select or promote a model;
- deploy a model;
- approve a governance action;
- mutate governed production state;
- become governance truth merely because it is visible in the Command Center.

## 8. Presentation contracts are part of governance correctness

**Classification:** COMBINED.

The final UI audit found multiple cases where the backend remained governed but presentation semantics were misleading.

The architectural response was to treat presentation adapters as explicit governed contract surfaces.

### Catalog lifecycle

PR #351 replaced an advertised `ARCHIVED` state with API-supported `RETIRED` while preserving server-side `catalog.update` authorization and the API allowlist.

**Authority:** backend lifecycle contract.

### Terminal issue resolution

PR #352 treats `RESOLVED` and `CLOSED` as terminal for the resolve-with-evidence form while preserving comments, intentional status controls, evidence enforcement and server authorization.

**Authority:** issue state/evidence contract, not button visibility.

### Data Quality recommendations and missing evidence

PR #354 introduced an explicit presentation contract:

- absent score evidence renders `N/A`, not literal `null`;
- persisted recommendations are type-checked and humanized;
- `approval_required` remains visible;
- raw JSON and internal finding identifiers are not presented as business copy;
- underlying governed evidence is not rewritten.

**Authority:** persisted evidence and approval state; presentation only changes representation.

## 9. Shared workspace actions must compose persona policy and capability policy

**Classification:** REPOSITORY-CONFIRMED and consistent with the chat-established access model.

PR #360 generalized the remediation lesson to shared surfaces.

A route that correctly denies access should not still be advertised by shared navigation or page actions.

Examples corrected included:

- Lineage ingest shown to a read-only Metadata Analyst;
- Agents/Discovery shown to a Source System Owner lacking those workspaces;
- Discovery shown to Senior Leadership despite persona policy;
- Physical Assets branding routing to a denied Dashboard destination.

The design is now:

- use deterministic workspace policy to determine whether the action should be presented;
- retain per-project capability gates where the operation requires them, such as `discovery.execute`;
- keep direct route authorization unchanged and authoritative;
- fall back to an allowed Home destination when Dashboard is unavailable.

No capability or persona permission is widened to satisfy presentation.

## 10. Physical identity and trust evidence have separate ownership

**Classification:** REPOSITORY-CONFIRMED.

PR #366 corrected a schema/authority mismatch on Physical Assets.

The page had assumed `identity_key` belonged to `catalog.current_catalog_source_assets`. The authoritative production schema did not expose that field there.

Stable native identity was instead available from the governed trust projection and linked by `discovered_asset_id`.

The chosen architecture is:

```text
current_catalog_source_assets
  -> source/discovered physical asset facts

current_asset_trust
  -> governed trust and stable identity evidence

exact discovered_asset_id join
  -> presentation enrichment
```

Authority rules:

- do not mutate schema merely to satisfy a presentation assumption;
- do not fabricate a native identity when governed trust evidence is absent;
- preserve native identity when trust evidence exists;
- otherwise fail closed to unknown;
- do not change promotion authority or production data as part of presentation repair.

## 11. Semantic copy must derive from governed catalogs

**Classification:** REPOSITORY-CONFIRMED.

PR #367 removed a hard-coded statement that DataNexus had eleven approved governance personas when the authoritative catalog contained thirteen.

The count now derives from `governancePersonaRoleKeys.length`, the same catalog used to bound the corresponding access-role query.

Architecture rule:

> A value that describes governed catalog cardinality should derive from the governed catalog, not from duplicated prose literals.

This reduces semantic drift while preserving authorization behavior.

## 12. Legacy theme compatibility is a scoped bridge, not a global recolor

**Classification:** REPOSITORY-CONFIRMED.

The design audit found legacy light-authored governance pages rendered with unreadable combinations under the dark platform root theme.

PR #361 chose a narrowly scoped compatibility layer rather than either of two broader alternatives:

- globally recoloring all modern controls;
- immediately rewriting every legacy workspace to the dark-native design system.

The compatibility stylesheet is intentionally:

- unlayered and imported after Tailwind layers so it wins where required;
- scoped to legacy light-authored root patterns;
- responsible for converting legacy light surfaces to governed dark surfaces and readable text/link tokens;
- prohibited from globally recoloring modern dark-native controls.

Deterministic contrast checks use the WCAG AA normal-text threshold.

### Tradeoff

This minimizes regression risk and restores readability quickly, but it remains a compatibility bridge. The reviewed material does not decide when the remaining legacy pages should be fully migrated to dark-native components and the bridge retired.

## 13. Job monitoring must observe recorded execution truth and must not trigger work by selection

**Classification:** REPOSITORY-CONFIRMED architecture direction, still unresolved as a release.

PR #363, the Living Tree monitor, remains an open draft.

Its architecture direction is important enough to preserve separately from release state.

### Execution truth

Each root execution is represented as a tree of actual child runs and explicit prerequisites rather than a flattened list.

UI state must derive from recorded execution evidence:

- colors and pulses from recorded state;
- percentages only where plan-backed progress exists;
- count-only historical progress where a percentage would be invented;
- bounded execution snapshots and ancestry checks;
- sanitized retry snapshots and prospective plan bindings stored within existing artifact constraints.

### Scheduling authority boundary

Selecting a queued execution must not trigger worker POSTs.

Existing cron/worker scheduling remains responsible for execution.

The monitor may expose explicit existing actions, but observation/selection must not become an implicit execution command.

### Rollout tradeoff

- Tree is the intended default;
- `JOB_MONITOR_TREE_ENABLED=false` plus redeploy returns to the shared List view;
- no database migration is required;
- no historical backfill is required.

This favors reversible rollout and reuse of recorded artifacts over a schema-heavy monitoring migration.

### Remaining release gates

The architecture is not production-accepted yet. The draft still requires:

- signed-in preview verification for authorized and unauthorized project personas;
- controlled new supervisor/profiling execution with manifests, retry evidence, diagnostics and cleanup/rollback;
- representative monitor API latency and payload measurements;
- current-head CI completion;
- deployed server-flag verification;
- normal merge and production commit/UI acceptance.

A passing synthetic browser fixture or READY preview is explicitly insufficient for authenticated production acceptance.

## 14. Autonomous engineering is permitted only with complete assurance evidence

**Classification:** CHAT-AGREED.

The user explicitly authorized autonomous execution of the implementation plan, but paired that autonomy with mandatory assurance work.

For governance-sensitive changes the expected lifecycle includes:

- implementation;
- post-implementation revalidation;
- unit and/or contract tests;
- negative and failure cases;
- an independently authored automated adversarial audit;
- exact-head protected CI;
- production verification when the change is deployed.

Autonomy does not relax evidence requirements.

## 15. Production mutations remain narrow and billing changes require explicit authorization

**Classification:** CHAT-AGREED.

Production verification should prefer read-only or narrowly scoped actions and avoid manufacturing production state solely for convenience.

A production role, persona or permission should not be altered merely to create a test condition.

Billing or cost-incurring configuration changes require explicit user authorization and are not implied by general engineering approval.

## Major tradeoffs resolved during the day

| Decision area | Chosen approach | Rejected or deferred alternative | Reason |
|---|---|---|---|
| Remediation navigation | Require capability plus workspace access | Broaden workspace permission | Preserve independent governance boundaries |
| Persona/shared navigation | Hide unavailable actions but keep route auth | Rely only on route denial and leave false affordances | Avoid misleading UX without weakening security |
| Retrieval evaluation | Minimal authenticated `SELECT` plus RLS | `SECURITY DEFINER` bypass or mutation grants | Restore intended read path without privilege escalation |
| Data Quality presentation | Deterministic presenter | Raw persisted JSON as UI copy | Preserve evidence while presenting business semantics |
| Physical asset identity | Enrich from trust projection by discovered identity | Add/fake `identity_key` in source projection | Respect authoritative schema and truth ownership |
| Persona count | Derive from catalog | Hard-coded literal | Prevent semantic drift |
| Legacy dark contrast | Scoped compatibility bridge | Global recolor or immediate full rewrite | Minimize regression while restoring readability |
| Job monitor | Recorded Living Tree with List fallback, no selection side effects | Flattened inferred progress and selection-triggered work | Preserve execution truth and scheduler authority |
| Release acceptance | Exact-head CI plus deployed behavior | Treat merge/deploy as sufficient | Production can reveal independent boundaries |

## Superseded decisions and status statements

### Capability-only remediation handoff

**Superseded by:** PR #356 combined capability + workspace access model.

PR #355's capability-only routing was a valid first correction but incomplete in production because workspace access is an independent boundary.

### Morning checkpoint status for PRs #351, #352 and #354

The earlier September 13 checkpoint correctly recorded those PRs as open at that time.

That status is now superseded:

- PR #351 merged as `d4b850235546fcd2c13de422729a3bacae8983ca`;
- PR #352 merged as `1d5af31f5bd2a320d8cd1e60644738b6a47392bb`;
- PR #354 merged as `e51ddb5ed1df40a59d4b5c90e603e47f92671d66`.

The historical file should remain unchanged as a time-specific snapshot.

### Retrieval-evaluation 500 as an unresolved observation

The earlier checkpoint recorded the permission-denied 500 as unresolved.

That status was subsequently superseded by PR #358, which restored the intended governed read path without adding mutation authority or bypassing RLS.

### Physical Assets `identity_key` assumption

The assumption that `identity_key` belonged to `current_catalog_source_assets` was superseded by the authoritative-schema model implemented in PR #366: source assets are enriched from `current_asset_trust` by `discovered_asset_id`.

### Hard-coded eleven-persona copy

The duplicated literal was superseded by deriving the current count from the governed persona-role catalog in PR #367.

### Presentation relying only on direct route denial

The prior cross-surface pattern where unavailable actions remained visible and direct navigation later failed closed was superseded by PR #360. Presentation now composes the deterministic workspace policy while route authorization remains final authority.

## Unresolved architecture items

### Living Tree production acceptance

PR #363 remains a draft and is the main unresolved architecture/release item identified in this review.

Its truth model and scheduler boundary are defined, but authenticated persona verification, controlled execution evidence, representative load measurements, current-head release validation and production acceptance remain outstanding.

### Legacy compatibility bridge retirement

The scoped dark-contrast bridge is merged and intentionally narrow. The reviewed material does not define a migration plan or retirement criterion for converting all remaining legacy light-authored workspaces to dark-native components.

This should remain visible as design-system technical debt rather than being mistaken for the long-term target architecture.

### Positive live remediation persona coverage

The previously failing Senior Leadership case was production-verified after #356 without widening permissions. The positive workflow path is deterministically tested, but the reviewed record did not create or mutate a production role solely to produce a live persona holding both `policy.approve` and workflows workspace access.

This is a verification-coverage limitation, not an authority-model uncertainty.

## Current implementation direction

The September 13 discussions and repository outcomes establish the following implementation direction:

1. continue deterministic-first governance and presentation contracts;
2. classify audit findings by design, architecture, build, agreed requirement, governance contract and production observation;
3. capture every verification output required to support lifecycle claims;
4. preserve server, route, database and workflow authority even when UI presentation is corrected;
5. compose all relevant authorization gates instead of assuming one capability implies another;
6. fail closed when evidence, identity, workspace access or state semantics are unknown;
7. derive semantic copy from authoritative catalogs and contracts rather than duplicated literals;
8. use narrow compatibility or projection fixes instead of broad permission/schema changes when the underlying authority model is already correct;
9. require negative/failure and independently authored adversarial validation for governance-sensitive changes;
10. keep draft architecture work such as the Living Tree explicitly non-production until authenticated and operational release gates are satisfied.

## Related implementation evidence

- PR #351 - Align catalog lifecycle editor with governed API contract
- PR #352 - Hide resolve action for terminal governed issues
- PR #354 - Add governed Data Quality presentation contract
- PR #355 - Fix governed human remediation handoff
- PR #356 - Honor workflow workspace policy in remediation handoff
- PR #358 - Restore governed retrieval evaluation read access
- PR #360 - Gate shared workspace actions by persona policy
- PR #361 - Restore readable contrast on legacy governance workspaces
- PR #363 - Implement Living Tree job monitoring with recorded execution evidence (draft)
- PR #366 - Align Physical Assets with authoritative schema
- PR #367 - Derive Project Roles persona count from governed catalog

## Cross reference

The discussion-oriented decision register and chronological synthesis are recorded in:

- `Major discussion/2026-09-13-chat-review-decision-register-and-unresolved-items.md`
