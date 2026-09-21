# DataNexus UX Closure — Post-Implementation Validation Plan

Date: 2026-09-21  
Integration branch: `feat/ux-closure-wave13-20260921`

## Objective

Close the remaining authenticated DataNexus product-shell gaps without weakening server authorization, adding mutation authority, or creating uncontrolled preview/deployment fan-out.

## Acceptance gates

The UX closure is implementation-complete only when the exact branch head passes all of the following:

1. Product Shell and CTA contract revalidation across earlier UX waves.
2. Residual authenticated-page inventory: every product page must use the shared shell unless it is an explicitly documented special route.
3. Skip-link and keyboard-bypass contract validation.
4. Persona/workspace navigation fail-closed checks.
5. CTA destination and interaction inventory.
6. Unit/security contract tests for the Wave 13 residual surfaces.
7. Negative and failure-path tests for missing resources, unauthorized execution evidence, unsupported source-edit paths, and truthful empty states.
8. Independent adversarial audit proving no page gained direct database mutation authority and existing authorization boundaries remain authoritative.
9. WCAG 2.2 AA persona accessibility contract revalidation, including keyboard-only, focus-order, screen-reader, zoom, narrow-viewport, dynamic-status and form-error-recovery evidence rules.
10. Profiling lifecycle and remediation lifecycle regression checks.
11. Concurrent-main regression tests for the Cloudflare canary changes reconciled into the UX branch.
12. Exact-head TypeScript validation.
13. Exact-head production build.

## Fail-closed criteria

Any failed gate blocks integration. In particular:

- navigation is hidden when the persona/workspace policy denies it;
- project evidence pages retain their existing capability checks;
- source registration requires mutation authority rather than read authority;
- missing or unauthorized resources resolve through existing fail-closed paths;
- no UX page introduces direct insert/update/delete/upsert authority;
- special routes such as authentication, external token approval, and persona landing remain explicit exceptions rather than accidental shell gaps.

## Integration sequence

While the temporary `main` merge freeze remains active, keep the validated UX stack isolated and do not open additional preview-producing PRs.

After the freeze is released:

1. Reconcile against the then-current `main`.
2. Re-run the complete exact-head gate.
3. Open a single controlled integration PR.
4. Require repository governance, navigation integrity, security and build checks to pass on the PR head.
5. Perform final deployment/browser smoke validation on the integrated environment.
6. Merge only with zero-behind status and unchanged validated head.

## Post-merge verification

After merge, verify the production/deployed surface for:

- primary navigation and persona-specific visibility;
- every top-level CTA and local CTA destination;
- keyboard skip behavior and focus placement;
- authenticated empty/error states;
- Dataset → Profile → Finding → Governance → Remediation → Verification continuity;
- admin/control-plane authorization boundaries;
- Cloudflare infrastructure status presentation;
- no regression in profiling/remediation lifecycle contracts.

Browser-level production smoke validation is intentionally performed only after controlled integration, because this repository currently has no Playwright/Cypress branch harness and uncontrolled preview deployments are intentionally avoided.
