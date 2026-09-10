# ADR-007: Single-organization deployment boundary

Date: 2026-09-10
Status: Accepted

## Decision

Each DataNexus deployment serves exactly one organization.

The deployment, database and supporting infrastructure are dedicated to that organization. Organization switching is not a supported runtime capability. The database remains explicitly organization-scoped for referential integrity, authorization, auditability and future architectural flexibility, but organization membership must never be used to select an alternate tenant context.

The canonical organization for an instance is the one and only row in `app.organizations`. Runtime code must fail closed if the dedicated database contains zero organizations or more than one organization.

Authenticated users must have exactly one valid membership for the instance organization. Any membership referencing another organization is a data or configuration integrity defect. DataNexus must reject that condition rather than automatically selecting, switching, repairing or deleting organization context. Correction is an administrative action performed after the situation and root cause are understood.

## Context

The role-aware landing resolver previously selected a user's first organization membership by `created_at`. That behavior assumed multi-organization membership and made membership ordering an implicit source of tenant authority.

The accepted deployment model is simpler and stronger:

```text
One DataNexus deployment
        ↓
One organization
        ↓
Dedicated database and infrastructure
        ↓
Organization policies, documents and knowledge
        ↓
Organization users and projects
        ↓
Governance, profiling, evidence and AI context
```

A user can therefore never choose an active organization inside a DataNexus instance. Membership answers whether the user may access the instance organization. It does not determine which organization the instance represents.

## Runtime rules

1. `app.organizations` must contain exactly one canonical organization for the deployment.
2. A signed-in user must have exactly one membership in that organization before organization-scoped application access is granted.
3. Membership rows for another organization are integrity defects and fail closed.
4. Organization switching UI, APIs, cookies and session preferences are not part of the supported runtime model.
5. Projects remain subordinate to the instance organization.
6. Organization-level policies, documents and knowledge are the default authority scope. Project scope may narrow context where a capability requires it.
7. Existing `organization_id` relationships remain in the schema and should continue to be used for scoping and defensive validation.
8. Governance persona and organization authority remain separate dimensions. A governance persona does not grant organization administration privileges.
9. The existing thirteen governance personas remain authoritative and are not changed by this decision.
10. Server-side governance evidence, including `governance.control_evaluations`, remains a legitimate landing-page dependency and must retain least-privilege server access.

## Integrity failure handling

Unexpected organization state is not repaired automatically.

When zero or multiple organization rows exist, a user lacks the required membership, or a user has membership outside the instance organization:

- fail closed for organization-scoped access;
- surface an explicit integrity/configuration error in server diagnostics;
- preserve relevant evidence and logs;
- determine the root cause;
- remove or update the incorrect organization data through an authorized administrative path based on that analysis.

The runtime must not choose the oldest membership, newest membership, first database row, or any other implicit fallback.

## Alternatives considered

### User-selectable active organization

Rejected. The deployment model deliberately dedicates an instance and its infrastructure to one organization, so active-organization selection would add state and authorization complexity without serving a supported product scenario.

### Deployment environment variable containing the organization ID

Not required for the current dedicated-database model. Requiring exactly one organization row in the database avoids duplicating organization identity between deployment configuration and the authoritative application database. If infrastructure requirements later demand an external instance identifier, it may be added as a consistency assertion rather than as a tenant-switching mechanism.

### Removing organization IDs from the schema

Rejected. Organization IDs remain valuable for referential integrity, explicit scope, audit evidence and future migration flexibility.

## Consequences

### Positive

- Eliminates ambiguous active-organization resolution.
- Removes organization switching from the attack and complexity surface.
- Makes accidental cross-organization data visibly invalid instead of silently routable.
- Preserves existing project, governance and persona architecture.
- Avoids duplicated deployment organization configuration.

### Trade-offs

- One organization requires one separate DataNexus deployment, database and infrastructure stack.
- Cross-organization consolidated views are outside this runtime boundary and would require a separately designed aggregation architecture.
- Integrity defects may intentionally make organization-scoped application paths unavailable until corrected.

## Migration impact

The existing schema is retained. No destructive database migration is required for this decision.

Application organization resolution must move from membership-order selection to the single-instance invariant. Verification must detect regression to first-membership behavior and preserve the thirteen-persona model.

## Affected components

- `lib/governance/instance-organization.ts`
- `lib/governance/landing-access.ts`
- role-aware landing-page resolution
- organization membership validation
- governance landing settings
- project-scoped persona role resolution
- deployment and database integrity verification

## Validation criteria

This decision is implemented when:

- organization context is never chosen by membership ordering;
- runtime requires exactly one organization in the dedicated database;
- users without the correct membership fail closed;
- unexpected foreign-organization membership fails closed;
- landing persona and settings are resolved only inside the instance organization;
- existing thirteen persona definitions remain unchanged;
- governance verification includes an explicit single-organization regression gate;
- production database state satisfies the exactly-one organization invariant.
