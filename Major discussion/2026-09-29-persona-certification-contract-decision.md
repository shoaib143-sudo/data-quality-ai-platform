# Persona Certification Contract and Stale Assertion Decision

Date: 2026-09-29
Decision scope: DataNexus 13-persona certification and P0 closure

## Context

The 13-persona certification encountered a structural failure caused by a test assertion coupled to an internal implementation identifier. The current implementation had evolved, while the assertion still searched source text for an older symbol.

This failure does not by itself establish a persona, authentication, authorization, or governance defect. It establishes that the structural test and implementation contract require reconciliation.

## Engineering decision

Do not solve this class of failure by swapping one implementation-name regex for another.

Certification should answer whether the required persona behavior and security boundaries hold, regardless of the internal helper used to implement them.

The certification architecture therefore separates:

Persona definition contract -> authentication -> authorization -> route and CTA behavior -> governance enforcement -> negative cases -> session isolation -> accessibility -> integrated journeys -> consolidated CI/security -> frozen candidate SHA -> exact-head deployment verification.

## Authorization evidence

For every persona, maintain explicit positive and negative expectations. Relevant outcomes include ALLOW, DENY, APPROVAL_REQUIRED, and ADMIN_ONLY.

A successful privileged operation is not enough. Corresponding non-privileged personas must be verified as unable to perform that operation.

Deny-by-default and least-privilege expectations remain mandatory. No test repair may weaken them.

## Browser evidence

Live browser tests should exercise user-visible behavior and use accessible locators where practical. Each persona run should use isolated authentication/session state.

Implementation details may still receive focused unit tests when structurally important, but they should not substitute for behavioral certification.

## Accessibility evidence

Automated accessibility checks form one evidence layer. They are not represented as complete WCAG certification on their own.

## Release sequencing

The P0 closure funnel should reject defects as early and cheaply as possible. Structural and behavioral tests precede deployment verification.

Exact-head Vercel verification is intentionally last, after functional acceptance and consolidated CI/security converge, to avoid unnecessary deployments and protect Hobby-plan capacity.

## Sources reviewed

Playwright Best Practices and Locators, OWASP Authorization Cheat Sheet and Authorization Testing Automation guidance, W3C Accessibility Conformance Testing guidance, and the established test-pyramid principle.

## Operational consequence

The stale assertion should be replaced by a contract-oriented test that verifies the current 13-persona acceptance behavior. The live certification is rerun only after that structural correction passes without reducing authorization, governance, security, negative, or failure-path coverage.
