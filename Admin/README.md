# DataNexus AI Administration

This folder contains operator-facing runbooks, deployment controls, production safety boundaries, recovery procedures, and administrative state that should remain distinct from product discussion and implementation code.

## Scope

Administrative records should describe:

- production deployment procedures;
- hosting-provider operational controls;
- retention and quota management;
- release and rollback procedures;
- scheduler authority;
- live migration/cutover gates;
- incident-specific operator instructions;
- manual settings that are not fully represented in code.

Do not store credentials, access tokens, secrets, private keys, or other sensitive values in this folder.

## Current runbooks

- `2026-09-19-vercel-cloudflare-r2-operations-runbook.md` records the Vercel deployment-capacity controls, Git disconnect state, Cloudflare canary/DR boundary, R2 production certification gates, exact-SHA release procedure, and rollback rules established during the September 19 capacity incident.

## Preservation rule

Administrative decisions should be dated. Time-sensitive state must be marked as observed rather than permanent. Before executing a production action, operators must revalidate the live platform state and current repository HEAD.
