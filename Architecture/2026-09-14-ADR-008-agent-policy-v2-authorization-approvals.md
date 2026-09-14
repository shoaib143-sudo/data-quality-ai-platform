# ADR: Agent Policy v2 authorization, approvals and conversational access

Date: 2026-09-14
Status: Proposed in PR #422

## Decision

DataNexus separates access to AI Agents from authority to execute operational actions.

All 13 governance personas may enter the Agents workspace and use governed conversational capabilities, subject to existing resource entitlements. Operational actions are independently controlled by capabilities.

### Capability classes

Read and conversational:
- agent.view
- agent.converse
- agent.investigate
- agent.recommend
- execution.view
- execution.view_results
- execution.view_evidence

Operational:
- agent.execute
- execution.retry
- execution.cancel
- execution.approve
- agent.admin

Persona controls the default experience. Capabilities, resource scope and deterministic policy control authority.

## Job visibility

Job Monitor is available to all 13 personas. Visibility is scoped to resources the user is authorized to see. Project membership alone is not sufficient when an explicit resource ACL exists.

Explicit resource DENY overrides ALLOW. Dataset owners and current stewards retain visibility within their project context. Where no resource-specific ACL exists, project membership remains the compatibility fallback.

Monitoring is observational. Selecting or refreshing an execution must never trigger worker processing.

## Approval policy

Material production mutations always require two independent approval axes:

1. Business approval
2. Governance approval

Business approval may be satisfied by a Data Owner or Data Steward. Data Steward is a full substitute for Data Owner.

The same individual cannot satisfy both approval axes for one request.

Approvals always require a reason/comment.

Break-glass execution is not supported.

Approval remains valid until execution only while the execution fingerprint remains unchanged. A material change invalidates the approval.

## Delegation

Delegation is individual only, never group-based.

Both permanent and time-bound delegation are supported.

Delegated authority is explicitly scoped by:
- domain
- optional project
- approval axis
- action types
- maximum risk
- start time
- optional end time

Delegates never inherit all authority of the delegator.

Delegated decisions record both the approving user and the delegator on whose behalf the decision was made.

## Risk

Risk combines:
- business criticality
- data sensitivity
- financial impact
- production scope
- reversibility
- operational blast radius
- compute/cost impact

CDE and KDE establish at least a HIGH risk floor.

CDE/KDE plus a material production mutation is CRITICAL.

Non-production CDE/KDE activity does not automatically require Business + Governance approval.

## SLA

Approval escalation SLAs are business-day targets:
- LOW: 7 days
- MEDIUM: 5 days
- HIGH: 3 days
- CRITICAL: 1 day

SLA breach never auto-approves. It triggers reminder/escalation while the request remains pending.

## Conversation defaults

Policy layering:
1. Platform safety/governance constraints
2. Persona defaults
3. Domain override
4. Project override
5. User preference

User/project/domain preferences can change presentation but never authorization.

## Approval channels

DataNexus, Email and Microsoft Teams are interfaces to one approval service and one audit trail.

Channel delivery never grants authority. The approval decision is always re-authorized server-side against the current user, domain, project, axis and risk.

The scheduled worker processes a channel-neutral outbox.

Provider configuration:
- DATANEXUS_APPROVAL_EMAIL_WEBHOOK_URL
- DATANEXUS_APPROVAL_TEAMS_WEBHOOK_URL

If provider configuration is absent, the outbox records a visible failed delivery with PROVIDER_NOT_CONFIGURED. No approval decision is lost or auto-completed.

## Security invariants

- The model never decides authorization.
- Approval does not imply execution authority.
- Executor capability is rechecked at execution time.
- Job visibility does not imply mutation authority.
- Monitoring cannot kick a worker.
- Resource DENY wins.
- Same-person dual-axis approval is rejected.
- Missing provider configuration cannot bypass approval.
