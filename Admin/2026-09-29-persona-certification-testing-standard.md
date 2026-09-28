# 13 Persona Certification Testing Standard

Date: 2026-09-29
Status: Adopted for DataNexus P0 closure

## Decision

DataNexus persona certification must validate behavioral, authorization, governance, navigation, accessibility, and isolation contracts. Certification tests must not depend on incidental implementation identifiers when equivalent observable behavior can be tested.

A stale source-text assertion such as requiring a runner to contain a specific internal symbol is not sufficient certification evidence. Refactoring an internal helper must not fail certification when the externally required security and behavioral contract remains unchanged.

## Required layers

1. Persona contract: all 13 expected persona definitions resolve to valid acceptance specifications.
2. Authentication: each persona authenticates independently.
3. Authorization: allowed and denied capabilities are explicitly tested.
4. Navigation: authorized routes and CTAs work; unauthorized routes remain denied.
5. Governance: approval-required, admin-only, guided, governed-auto, and autonomous boundaries remain enforced.
6. Session isolation: authentication state, cookies, storage, and persona context do not leak between personas.
7. Negative and failure paths: malformed, unauthorized, and invalid actions fail safely.
8. Accessibility: automated accessibility evidence is collected without treating automation alone as complete WCAG conformance.
9. Integrated journeys: Golden Path, Data 360, Governed AI, and required execution modes produce evidence.
10. Release evidence: consolidated CI and security checks must converge before freezing a candidate SHA.

## Test design rules

Prefer contract tests against exported behavior over regex searches for internal function names.

Use browser tests for browser-visible behavior. Prefer accessible, user-facing locators such as roles and labels.

Keep authorization negative tests as first-class gates. Never repair a stale test by weakening authorization, governance, security, denial, or approval expectations.

Use isolated browser contexts for persona runs.

A change from one internal routing helper to another is acceptable only when the same or stronger behavioral and authorization contract is demonstrated.

## P0 sequencing

Run inexpensive structural, contract, authorization, integration, negative, navigation, and accessibility checks before expensive live deployment verification.

Vercel exact-head verification occurs only after functional acceptance converges. Avoid redundant preview deployments and deployment flooding.

## References

- Playwright Best Practices: https://playwright.dev/docs/best-practices
- Playwright Locators: https://playwright.dev/docs/locators
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Authorization Testing Automation: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html
- W3C ACT Overview: https://www.w3.org/WAI/standards-guidelines/act/
- Martin Fowler, Test Pyramid: https://martinfowler.com/bliki/TestPyramid.html
