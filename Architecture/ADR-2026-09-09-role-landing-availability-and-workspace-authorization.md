# ADR: Role Landing Availability and Workspace Authorization

Date: 2026-09-09
Status: Accepted and implemented

## Context

DataNexus now provides role-specific landing pages for eleven personas. A landing page is a presentation experience, while access to an operational workspace is an authorization decision. These concerns must remain separate so that hiding a card or disabling a landing page is never treated as a security boundary.

DataNexus also has two distinct role dimensions that must never be conflated:

1. Organization privilege: `OWNER`, `ADMIN`, `MEMBER`.
2. Governance persona: one of the eleven governance roles below.

A user may therefore be an organization `MEMBER` and a Data Governance Admin persona, or an organization `OWNER` and a Senior Leadership persona. Organization privilege controls organization administration. Governance persona controls the governance landing experience and operational governance workspaces.

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

DataNexus will enforce independent controls.

### 1. Landing page availability

Organization OWNER or ADMIN users can enable or disable each persona landing page under `/admin/landing-pages`.

The setting is stored in `governance.landing_page_settings` using the composite key `(organization_id, persona_slug)`.

A disabled persona is redirected to `/home/unavailable`.

### 2. Governance workspace authorization

Operational routes are protected at their Next.js layout boundary by `requireWorkspaceAccess()` from `lib/governance/workspace-access.ts`.

A user cannot gain access by manually entering a URL. Persona navigation is therefore a presentation of authorized capabilities, not the authorization mechanism itself.

The full `/dashboard` governance workspace is reserved for the Data Governance Admin persona.

### 3. Organization administration authorization

The `/admin` workspace is not a governance-persona capability. It requires organization `OWNER` or `ADMIN` privilege.

`canAccessWorkspace()` treats the `admin` workspace as an explicit organization-privilege boundary and does not fall through to the persona matrix. The Data Governance Admin persona therefore cannot grant `/admin` access to an organization `MEMBER`.

Organization administration links such as role administration and landing-page administration must likewise be exposed only from organization privilege, not from the Data Governance Admin persona definition.

## Governance Role Catalog and Resolution

The finalized role catalog uses explicit role keys:

- `SENIOR_LEADERSHIP`
- `BUSINESS_USER`
- `DATA_OWNER`
- `DATA_PRODUCT_OWNER`
- `DATA_STEWARD`
- `DATA_GOVERNANCE_SPECIALIST`
- `COMPLIANCE_RISK_OFFICER`
- `PRIVACY_SECURITY_OFFICER`
- `DATA_GOVERNANCE_ADMIN`
- `DATA_CUSTODIAN`
- `SOURCE_SYSTEM_OWNER`

`lib/governance/resolve-persona.ts` resolves these explicit governance role keys deterministically. Organization `OWNER` or `ADMIN` status is not used to manufacture a governance persona when an explicit governance role is present. Legacy role labels may remain only as compatibility inputs and must not make `QUALITY_MANAGER` equivalent to Data Governance Admin.

## Security Boundary

`governance.landing_page_settings` is protected by RLS and direct `anon` and `authenticated` table privileges are revoked. The administrator mutation is executed server-side through the service-role client only after verifying the authenticated user is an OWNER or ADMIN of the target organization.

The table has foreign keys to `app.organizations(id)` and `auth.users(id)` for `updated_by` provenance.

The last organization OWNER protection is independent of governance persona assignment and must not be weakened by role-management changes.

## UX Rule

Persona landing pages show only role-relevant navigation. Non-relevant workspaces are hidden completely. Direct route authorization is still enforced independently.

Examples:

- Senior Leadership sees enterprise confidence, business areas, risks, reports and actions, not profiling or administration workspaces.
- Data Owners see their governed domains, data quality, stewardship approvals and lineage, not Data Governance Admin workspaces.
- Data Governance Admin can access the technical governance workspace catalogue appropriate to that persona, but organization administration remains available only when the same user separately holds organization OWNER or ADMIN privilege.

## Implementation References

- `lib/governance/personas.ts`
- `lib/governance/resolve-persona.ts`
- `lib/governance/landing-access.ts`
- `lib/governance/workspace-access.ts`
- `components/governance/role-landing-page.tsx`
- `app/home/page.tsx`
- `app/home/[persona]/page.tsx`
- `app/home/unavailable/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/landing-pages/page.tsx`
- `app/admin/landing-pages/actions.ts`
- `governance.access_roles`
- `governance.project_role_bindings`
- `governance.landing_page_settings`

## Consequences

- Role presentation and route authorization are no longer coupled.
- Organization privilege and governance persona are independent dimensions.
- A Data Governance Admin who is an organization MEMBER cannot open `/admin` or organization-administration pages.
- A Data Owner cannot see or open the Data Governance Admin landing experience unless the user's resolved governance persona actually grants it.
- Administrators can disable an otherwise valid role landing page without changing the user's underlying governance role.
- New workspaces must be added to the workspace authorization matrix and protected at a route layout boundary before being exposed in persona navigation.
