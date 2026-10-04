# ADR: Governed Visual Execution and Verification

## Decision

DataNexus will treat browser automation as a provider-neutral governed execution capability. Browser Use is the first external provider, not a hard platform dependency.

## Control path

Agent Runtime v2 → pinned tool contract → authorization/policy gate → browser execution provider → target system → evidence → independent verification → Job Monitor.

Browser execution never weakens existing approval, persona, resource ACL, tool input/output validation, cancellation, audit, or evidence requirements.

## Execution hierarchy

Prefer native API, governed MCP/tool, or SDK execution. Browser automation is used when UI interaction is necessary. Browser observation is also a first-class verification mechanism after non-browser execution.

## Safety invariants

1. Every request is bound to a DataNexus run and project.
2. Browser targets require an explicit HTTP(S) origin allowlist.
3. Credentials are never embedded in URLs or prompts.
4. High-risk execution requires a bound approval identifier.
5. Provider credentials remain server-side.
6. Provider identity and execution identity are validated before evidence is accepted.
7. Live-view URLs are evidence access paths, not authorization substitutes.
8. Provider failure must fail closed and must not silently bypass governance.

## Provider strategy

The provider contract permits Browser Use, CDP/Playwright, TinyFish, and future adapters. Browser Use Cloud is initially connected through its API transport. The transport can move to the Browser Use v4 SDK without changing DataNexus callers.

## Handsfree E2E

Handsfree runs can attach visual execution to recommendation → authorization → action → verification → closure. The Job Monitor may expose live execution only to users already authorized for execution evidence.

## Verification

Execution and verification should be separable. For high-impact operations, DataNexus should verify the resulting target state independently through API/database state and, where useful, browser-visible state.
