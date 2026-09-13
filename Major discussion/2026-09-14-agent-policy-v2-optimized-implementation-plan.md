# Agent Policy v2 optimized implementation plan

Date: 2026-09-14
Implementation PR: #422

## Wave 1: contracts and workspace separation

Parallel streams:
1. Capability catalog and risk/approval contract
2. 13-persona conversational defaults
3. Universal Agents/Job Monitor workspace access
4. Persistence schema for approvals, delegation and preferences

Status: implemented.

## Wave 2: authorization and observability

Parallel streams:
1. Deterministic per-action authorization helper
2. Resource-scoped execution visibility
3. CDE/KDE risk context and execution fingerprinting
4. Conversation capability separated from operational execution

Status: implemented.

## Wave 3: approval core

Parallel streams:
1. Business/Governance approval state machine
2. Individual scoped delegation
3. Individual approval authority registry
4. Fingerprint-bound execution validation

Status: implemented.

## Wave 4: channels and operational controls

Parallel streams:
1. DataNexus approval inbox and decision API
2. Channel-neutral Email/Teams/DataNexus notification outbox
3. execution.cancel and execution.retry capability split
4. Scheduled notification dispatcher

Status:
- DataNexus: implemented
- Email/Teams application adapter: implemented
- Email/Teams production transport verification: blocked pending provider webhook configuration
- cancellation capability split: implemented

## Wave 5: persona conversational experience

Parallel streams:
1. Persona defaults
2. Domain/project override resolver
3. User preference resolver
4. Suggested prompts and preferred agents

Status: implemented, including Settings-based user preference management. Preferences remain presentation-only and cannot alter authorization.

## Wave 6: execution integration

Parallel streams:
1. Execute/retry/cancel capability enforcement
2. Approval-aware material production mutations
3. Living Tree provenance linkage
4. Request-execution UX for non-executors

Status:
- cancellation enforcement: implemented
- execute/converse split: implemented
- approval service and fingerprint validation: implemented
- profiling/data-quality/supervisor request-execution UX: implemented
- approval-aware execution integration: implemented for requestable operational actions
- governed material-production mutation remains fail-closed until a concrete mutation executor is registered

## Wave 7: acceptance

Parallel streams:
1. 13-persona positive E2E
2. Negative/adversarial authorization tests
3. Performance/resilience tests
4. deployment, smoke and documentation

Status:
- unit/adversarial contracts added to Persona Workspace Policy CI
- production schema assertions implemented
- browser E2E pending exact-head preview and final release convergence

## Release criteria

PR #422 must not leave draft until:
- protected CI is green
- preview is READY
- all 13 personas can access Agents and Job Monitor
- non-executors cannot mutate execution state
- resource-scoped job visibility is proven
- material production mutation cannot execute without required dual approval
- same-person dual-axis approval is rejected
- delegated approval records on_behalf_of provenance
- notification provider absence is visible and fail-closed
- production smoke test passes


Release convergence: reconciled onto current main after Domain Cell Job Monitor #426-#428, preserving resource-scoped Agent Policy v2 authorization.
