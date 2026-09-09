# ADR: Role Landing Availability and Workspace Authorization

Date: 2026-09-09
Status: Accepted and implemented

## Context

DataNexus now provides role-specific landing pages for eleven personas. A landing page is a presentation experience, while access to an operational workspace is an authorization decision. These concerns must remain separate so that hiding a card or disabling a landing page is never treated as a security boundary.

## Final Persona Set

1. Senior Leadership
2. Business User
3. Data Owner
4. Data Steward
5. Data Governance Admin
6. Data Governance Specialist
7. Compliance & Risk Officer
8. Privacy & Security Officer
9. Data Custodian / Technical Steward
10. Data Product Owner
11. Source System / Application Owner

## Decision

DataNexus will enforce two independent controls.

### 1. Landing page availability

Organization OWNER or ADMIN users can enable or disable each persona landing page under `/admin/landing-pages`.

The setting is stored in `governance.landing_page_settings` using the composite key `(organization_id, persona_slug)`.

A disabled persona is redirected to `/home/unavailable`.

### 2. Workspace authorization

Operational routes are protected at their Next.js layout boundary by `requireWorkspaceAccess()` from `lib/governance/workspace-access.ts`.

A user cannot gain access by manually entering a URL. Persona navigation is therefore a presentation of authorized capabilities, not the authorization mechanism itself.

The full `/dashboard` governance workspace is reserved for the Data Governance Admin persona. Organization OWNER or ADMIN membership separately authorizes the `/admin` workspace.

## Security Boundary

`governance.landing_page_settings` is protected by RLS and direct `anon` and `authenticated` table privileges are revoked. The administrator mutation is executed server-side through the service-role client only after verifying the authenticated user is an OWNER or ADMIN of the target organization.

The table has foreign keys to `app.organizations(id)` and `auth.users(id)` for `updated_by` provenance.

## UX Rule

Persona landing pages show only role-relevant navigation. Non-relevant workspaces are hidden completely. Direct route authorization is still enforced independently.

Examples:

- Senior Leadership sees enterprise confidence, business areas, risks, reports and actions, not profiling or administration workspaces.
- Data Owners see their governed domains, data quality, stewardship approvals and lineage, not Data Governance Admin workspaces.
- Data Governance Admin can access the full technical governance workspace catalogue and the landing-page administration control.

## Implementation References

- `lib/governance/personas.ts`
- `lib/governance/resolve-persona.ts`
- `lib/governance/landing-access.ts`
- `lib/governance/workspace-access.ts`
- `app/home/page.tsx`
- `app/home/[persona]/page.tsx`
- `app/home/unavailable/page.tsx`
- `app/admin/landing-pages/page.tsx`
- `app/admin/landing-pages/actions.ts`
- `governance.landing_page_settings`

## Consequences

- Role presentation and route authorization are no longer coupled.
- A Data Owner cannot see or open the Data Governance Admin landing experience unless the user's resolved governance persona actually grants it.
- Administrators can disable an otherwise valid role landing page without changing the user's underlying governance role.
- New workspaces must be added to the workspace authorization matrix and protected at a route layout boundary before being exposed in persona navigation.
