# DataNexus Visual Execution & Verification Framework

## Decision

Browser automation is a governed execution provider and an independent verification mechanism, not a replacement for APIs, MCP tools, or native adapters.

Execution preference: native API, governed MCP/tool, SDK, browser automation.

Verification may combine API state, database state, browser/UI state, and policy/audit evidence.

## Runtime flow

Agent Runtime v2 -> authorization/policy -> BrowserExecutionGateway -> provider -> target system -> evidence -> independent verification -> Job Monitor.

Browser Use is the first provider. The contract remains provider neutral so CDP/Playwright, TinyFish, or future providers can be added without changing agent contracts.

## Security invariants

1. Fail closed when a domain is not allowlisted.
2. Deny URL embedded credentials.
3. Bound duration and action count.
4. High risk browser mutation requires an approval capable path.
5. Secrets remain server side and are never included in browser evidence.
6. Browser execution must retain run, agent run, project, persona, provider session, and verification correlation.
7. Live view URLs are observability data and must be access controlled.
8. Browser evidence supplements durable system of record evidence. It does not replace it.

## Workstreams

1. Provider neutral execution contracts and Browser Use adapter.
2. Governance, persona authorization, approvals, domain policy, and secret isolation.
3. Handsfree Runtime integration.
4. Neural Job Monitor live execution view and timeline.
5. Evidence bundle and independent verification.

## Completion gates

Unit and negative policy tests, provider contract tests, governed runtime integration, cancellation/timeouts, evidence persistence, Job Monitor presentation, live Browser Use validation, and post implementation adversarial review.

Live Browser Use validation requires `BROWSER_USE_API_KEY`. No credential is required for contract, policy, UI, or mock provider implementation.
