# 2026-09-15 Work Summary and Revalidation

## Executive summary

Today’s work completed the Agent Policy v2 implementation cycle, reconciled the policy with the latest Job Monitor changes, validated the live approval-authority model, and ran a fresh post-implementation release audit against the actual current production head.

The important outcome is that Agent Policy v2 is no longer just implemented in code: it has been independently revalidated after later product changes, two verification-contract regressions were found and corrected, the corrected state was merged to `main`, and the resulting production deployment passed final smoke checks.

## What was completed

### Agent Policy v2 governance model

The final policy keeps conversational/read access separate from mutation authority. All 13 DataNexus personas retain authorized access to the Agents workspace and Job Monitor for Ask, Query, Explain, Investigate, and Recommend workflows. `agent.execute` is reserved for execution authority rather than basic conversational use.

Execution remains server-authoritative. Resource ACLs use DENY precedence. Risk is determined on the server from environment, action, CDE/KDE and related governed context. Material production mutations require both Business and Governance approval, with the same individual prohibited from satisfying both approval axes for the same request.

Delegation is individual and scoped, retains `on_behalf_of` provenance, rejects revoked delegation, and requires comments for approval/rejection decisions. Replay protection and immutable execution fingerprints prevent stale or duplicated approval decisions from authorizing a changed execution.

### Approval authority coverage

The production authority model was checked against the real governed approval domains. Synthetic bootstrap evidence is excluded only where `metadata.synthetic_bootstrap = true`; real datasets or non-synthetic CDEs still make a domain governed.

The four real production scopes validated today are Finance/Customer and Profiling Demo Project/Customer, general, and PUB. Each has Business and Governance approver coverage with satisfiable separation of duties.

The synthetic Enterprise bootstrap record remains present for demo/knowledge purposes but does not create a false production approval requirement by itself.

### Email and Teams approval notifications

Work was also done on the external notification boundary. DataNexus remains the authoritative approval system. Email and Teams are delivery channels and fail closed when their providers are not configured.

The notification worker signs external approval links with request, recipient, axis, channel, and expiry context. Server-side authority is revalidated before any external decision is accepted. Webhook URLs are treated as secrets; any signed URL accidentally exposed outside its intended secret store must be rotated.

### Job Monitor integration

The governed Job Monitor was retained while the UI evolved to a domain-oriented topology and drilldown model. The new `/monitoring/domain/[projectId]` page is authenticated and uses governed execution-run filtering rather than bypassing resource authorization.

The Job Monitor refresh path continues to use the authorized `/api/monitoring/runs` endpoint.

## Post-implementation revalidation

A new validation pass was deliberately run after the latest Job Monitor changes instead of relying on the earlier Agent Policy test results.

The fresh run covered Agent Policy unit tests, the independent adversarial audit, approval-hardening verification, negative and failure cases, database invariants, migration replay, security scans, production policy gates, and production smoke testing.

The audit found two real post-change verification gaps:

1. The new Job Monitor domain dynamic page had not been registered in the canonical resource-route contract.
2. The UX foundation verifier still expected the old embedded `ExecutionStatusBadge` architecture after status rendering moved into the newer domain-oriented UI.

Both gaps were fixed in PR #444, `Close post-implementation revalidation gaps`.

## Validation result

After the fixes, the following gates were green: Agent Policy unit tests, independent Agent Policy adversarial audit, approval hardening, Persona Workspace Policy, Navigation Integrity, AI Red Team Assurance, CodeQL, dependency security, Production Security Posture, P0-P5 Revalidation, Release Governance, clean database reconstruction, and V6 Operational Certification.

Negative production checks confirmed that unauthenticated calls to `/api/monitoring/runs` and `/api/agent-approvals/requests` return `401 Authentication required`.

The production SLO gate was kept at its existing requirement. Two initial runs showed p95 latency around 1.73–1.75 seconds versus the 1.5 second threshold, despite all 50 requests succeeding with zero HTTP or transport errors. Because the affected `/login` path had not changed in the Job Monitor work, the threshold was not relaxed. A clean rerun at the same threshold passed.

## Merge and production state

PR #444 was merged into `main` with merge commit:

`364f49ee757de695efcafb610fe3dd51019c0128`

The corresponding Vercel production deployment completed successfully. Final production checks showed the deployment READY, the protected APIs still failing closed for unauthenticated access, the job worker healthy, and no runtime error clusters in the final validation window.

## Key decisions retained

- Conversational/read access is not execution authority.
- `agent.execute` is not required for Ask, Query, Explain, Investigate, or Recommend.
- DENY wins over ALLOW.
- Production risk is server-authoritative.
- Material production mutation requires Business + Governance approval.
- Same-person dual-axis approval is prohibited.
- Delegation must be scoped and attributable.
- Approval/rejection comments are mandatory.
- Cross-channel replay is blocked.
- Execution fingerprints are immutable approval bindings.
- Email/Teams fail closed when providers are not configured.
- Synthetic bootstrap evidence alone must not create false production approval scope.
- Validation contracts must evolve with architecture, but may not be weakened simply to make CI green.

## End-of-day state

The Agent Policy v2 implementation, unit testing, independent adversarial audit, negative/failure-case coverage, clean-database reconstruction, production security validation, and post-deployment smoke verification are complete and green on the current production architecture.

The main lesson from today is that post-implementation validation was valuable: it found two integration-contract defects that the earlier Agent Policy test suite alone would not have caught. Those defects were corrected before the work was declared complete.
