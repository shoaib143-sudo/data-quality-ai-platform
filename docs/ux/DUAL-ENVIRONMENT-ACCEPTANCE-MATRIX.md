# UX dual-environment acceptance execution matrix

Status: execution plan; not evidence of completed browser or live testing. Scope: all 79 routes in `docs/ux/DATANEXUS-UX-ALL-PAGES-REVALIDATION.md`. Keep work on the existing UX PR. No merge, production deployment, destructive production writes, or paid canaries without explicit authorization.

## Evidence contract
Each scenario must record: environment and deployment SHA; route and persona; synthetic fixture ID or redacted live object reference; action and expected result; observed result; screenshot or trace location; browser/viewport; accessibility findings; authorization decision; severity; retest SHA; reviewer. Never represent a static source contract or passing CI as browser acceptance.

## Five independently executable streams

| Stream | Controlled environment (Stage 1) | Live environment (Stage 2) | Exit evidence |
|---|---|---|---|
| 1 Navigation & all pages | Enumerate every manifest route; navigate primary/secondary CTAs; verify context-preserving deep links, loading and error states; 1440/1024/390px viewport sweeps. | Repeat authenticated cross-module journeys with real asset IDs; verify no broken or unauthorized links. | Route × viewport × CTA matrix, screenshots and browser trace. |
| 2 Accessibility & personas | Keyboard traversal, visible focus, semantic names, contrast, reduced motion, responsive overflow; admin, steward, analyst, read-only and denied-role test identities. | Repeat role-specific journeys with actual assigned permissions; do not request elevated permissions to make a test pass. | Persona × permission matrix, accessibility findings and reproducible steps. |
| 3 Data 360 & governed AI | Synthetic CSV/table: Catalog → Dataset 360 → profile → DQ → lineage → evidence → governance decision → remediation → verification; Ask → Understand → Recommend → Approve → Execute → Observe → Learn; inject absent evidence. | Verify actual persisted profile/evidence and connected-service provenance; execute only pre-authorized non-destructive operations; require governance approval for learning cases. | Traceable object IDs, redacted evidence links and server-side authorization results. |
| 4 Quality & negative/failure | Run Navigation Integrity, Quality Gate, Persona Accessibility Acceptance, CodeQL, DQ presentation, AI Insights and P0–P5; simulate 401/403/404/429/500, network timeout, stale dataset, duplicate submission and missing lineage. | Non-destructive service degradation and access-denial checks only; do not disrupt shared services. | Final-SHA CI results, negative/failure case matrix and defect retests. |
| 5 Independent adversarial audit | Separately challenge CTA semantics, misleading scores, unsupported AI assertions, approval bypass, stale context and accessibility exceptions. | Reproduce critical journeys in a real browser and independently review redacted live evidence. | Signed-off issue register with zero open critical/high findings. |

## Stage gates
1. Stage 1 can begin without live credentials. Use isolated synthetic fixtures; record and clean up fixture IDs.
2. Stage 1 acceptance requires complete 79-route inventory coverage, applicable CTA and persona coverage, mandatory final-SHA CI success, browser evidence, and no unresolved critical/high defects.
3. Stage 2 requires an approved live URL, authorized test identities and safe dataset scope. Missing access is an explicit blocked test, never a pass.
4. Stage 2 acceptance requires live persistence and connected-service verification, server-side role boundaries, governed AI approval behavior, independent audit and no unresolved critical/high defects.
5. Production merge/deployment remains a separate explicit approval. CI pass alone is not either stage's acceptance.
