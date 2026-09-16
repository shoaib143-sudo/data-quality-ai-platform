# Security Test Plan

## Coverage

Authentication, session handling, authorization, RLS, IDOR, cross-project and cross-organization isolation, CSRF, XSS, injection, SSRF, file-upload abuse, secrets/log leakage, API abuse, rate limiting, privilege escalation, approval bypass, tool authorization, storage authorization, dependency/supply-chain controls, and webhook authenticity where applicable.

## Agentic security

Treat prompts, retrieved content, uploaded files, database values, metadata, tool output, memory, and agent-to-agent messages as untrusted inputs. Prove that untrusted content cannot grant authority or override policy.

## Approval security

Test self-approval restrictions, separation of duties, delegated authority, expiry, revocation, stale approvals, changed fingerprints, changed policies, duplicate decisions, concurrent decisions, replay, and exact-run binding.

## Evidence

Sensitive controls require explicit allow and deny evidence. A successful happy path alone cannot certify an authorization boundary.
