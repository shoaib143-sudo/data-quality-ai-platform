# DataNexus Role Landing Access Control and Administrator Toggles

Date: 2026-09-09
Status: Finalised and implemented

## Requirement

Administrators need control over which role landing pages are available, and users must not be able to browse into another persona's experience simply because the route exists.

The motivating example was that a Data Owner should not see or open the Data Governance Admin landing experience.

A second security requirement is equally important: the Data Governance Admin governance persona must not itself grant organization administration. Organization privilege and governance persona are separate dimensions.

## Final Design

Three controls are deliberately separated:

1. **Landing-page availability** controls whether a persona experience is enabled for an organization.
2. **Governance workspace authorization** controls which functional areas that governance persona is allowed to open.
3. **Organization administration authorization** controls `/admin` and requires organization `OWNER` or `ADMIN` privilege.

Hiding a card is not considered a security control.

## Administrator Experience

`/admin/landing-pages` lists all eleven DataNexus personas for every organization the current OWNER or ADMIN can manage. Each persona has an explicit Enabled or Disabled state and an administrator can change the state directly.

The eleven personas are:

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

The finalized governance role keys are `SENIOR_LEADERSHIP`, `BUSINESS_USER`, `DATA_OWNER`, `DATA_PRODUCT_OWNER`, `DATA_STEWARD`, `DATA_GOVERNANCE_SPECIALIST`, `COMPLIANCE_RISK_OFFICER`, `PRIVACY_SECURITY_OFFICER`, `DATA_GOVERNANCE_ADMIN`, `DATA_CUSTODIAN`, and `SOURCE_SYSTEM_OWNER`.

## Authorization Behaviour

- `/home` resolves the authenticated user's governance persona.
- Explicit governance role keys resolve deterministically to the corresponding persona.
- A user can open only the landing page matching that resolved persona.
- A disabled matching landing page redirects to `/home/unavailable`.
- Operational workspaces are protected by route-level layout guards.
- `/dashboard` is the full technical governance workspace and is reserved for Data Governance Admin.
- `/admin` requires organization OWNER or ADMIN authority and cannot be granted by governance persona.
- A `MEMBER` with the Data Governance Admin persona remains unable to access `/admin`.
- Nested admin routes inherit the top-level admin guard.
- Organization OWNER or ADMIN privilege does not replace an explicitly assigned governance persona.

## UX Behaviour

Persona navigation exposes only relevant governance capabilities. Organization administration links are driven separately by organization privilege.

Examples:

- Senior Leadership: enterprise confidence, material risk, business impact, trends, reports and actions.
- Business User: trusted-data discovery, fitness for use and consumption issues.
- Data Owner: domain confidence, critical issues, approvals, certification, lineage and business impact.
- Data Product Owner: product trust, SLA, certification, adoption and consumer impact.
- Data Steward: assigned issues, metadata gaps, classifications, findings and remediation.
- Data Governance Specialist: policy/control coverage, ownership, maturity and adoption.
- Compliance & Risk Officer: control failures, regulatory exposure, exceptions and evidence.
- Privacy & Security Officer: sensitive data, classification gaps, privacy exposure and lineage.
- Data Governance Admin: governance operational health and technical governance configuration, without inheriting organization administration.
- Data Custodian / Technical Steward: source, pipeline, observability, profiling and technical remediation health.
- Source System / Application Owner: source health, recurring defects, schema changes and upstream remediation.

## Persistence and Security

Persona availability is stored in `governance.landing_page_settings` with organization scope.

Governance roles are stored in `governance.access_roles` and user-to-project assignments in `governance.project_role_bindings`.

Security hardening includes:

- composite primary key `(organization_id, persona_slug)` on landing settings
- foreign key to `app.organizations`
- provenance foreign key from `updated_by` to `auth.users`
- persona value constraint covering the eleven approved personas
- RLS enabled on landing settings
- direct `anon` and `authenticated` landing-settings privileges revoked
- server-side landing-setting writes only after OWNER or ADMIN verification
- explicit `/admin` organization-privilege guard
- Data Governance Admin removed as a source of organization-admin authorization
- preservation of last-OWNER demotion protection

## Implementation Result

The previous full Governance Workspaces dashboard remains useful as the technical governance workspace, but it is no longer a general landing page. Business and governance personas enter through their role-aware `/home/<persona>` experience and are prevented from opening unauthorized workspaces by direct URL.

Persona landing pages now use role-specific evidence emphasis and decision framing while continuing to consume shared governed evidence rather than calculating independent governance meaning in the frontend.

This decision should be treated as the baseline for future DataNexus modules: every new module must declare which personas can access it before the module is added to navigation, and organization-administration functionality must never be granted solely by a governance persona.
