# DataNexus Role Landing Access Control and Administrator Toggles

Date: 2026-09-09
Status: Finalised and implemented

## Requirement

Administrators need control over which role landing pages are available, and users must not be able to browse into another persona's experience simply because the route exists.

The motivating example was that a Data Owner should not see or open the Data Governance Admin landing experience.

## Final Design

Two controls are deliberately separated:

1. **Landing-page availability** controls whether a persona experience is enabled for an organization.
2. **Workspace authorization** controls which functional areas that persona is allowed to open.

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

## Authorization Behaviour

- `/home` resolves the authenticated user's governance persona.
- A user can open only the landing page matching that resolved persona.
- A disabled matching landing page redirects to `/home/unavailable`.
- Operational workspaces are protected by route-level layout guards.
- `/dashboard` is the full technical governance workspace and is reserved for Data Governance Admin.
- `/admin` requires administrator authority, with organization OWNER or ADMIN membership accepted as the administrative boundary.
- Nested routes inherit the corresponding top-level workspace guard.

## UX Behaviour

Persona navigation exposes only relevant capabilities. Examples:

- Senior Leadership: Overview, Business Areas, Risks & Issues, Data Confidence, Reports, Actions.
- Business User: Search & Explore, Business Glossary, Trusted Data, My Requests.
- Data Owner: My Data Domains, Quality & Issues, Approvals, Lineage & Impact.
- Data Steward: My Tasks, Data Quality, Metadata & Glossary, Issues.
- Data Governance Admin: Platform Health, Connections, Roles & Permissions, Landing Pages, Audit.

## Persistence and Security

Persona availability is stored in `governance.landing_page_settings` with organization scope.

Security hardening includes:

- composite primary key `(organization_id, persona_slug)`
- foreign key to `app.organizations`
- provenance foreign key from `updated_by` to `auth.users`
- persona value constraint covering the eleven approved personas
- RLS enabled
- direct `anon` and `authenticated` privileges revoked
- server-side writes using the service-role client only after OWNER or ADMIN verification

## Implementation Result

The previous full Governance Workspaces dashboard remains useful as the technical administration workspace, but it is no longer a general landing page. Business and governance personas now enter through their role-aware `/home/<persona>` experience and are prevented from opening unauthorized workspaces by direct URL.

This decision should be treated as the baseline for future DataNexus modules: every new module must declare which personas can access it before the module is added to navigation.
