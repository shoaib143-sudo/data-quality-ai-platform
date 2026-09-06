# Module 15: Governance for AI Systems

DataNexus treats AI-system inventory, assessments, and deployment authority as separate evidence layers.

- AI systems have stable project-scoped identities.
- Stable `system_key` values encode origin: `int-*` for real internal systems, `ext-*` for external/provider/public systems, and `syn-*` for synthetic, demo, or test inventory. Example synthetic demo keys use `syn-demo-*`; external standards or reference systems can use origin-specific keys such as `ext-nist-*`.
- Every material configuration is an immutable semantic version.
- Assessments may be recorded by humans, system checks, or governed agents, but do not grant deployment authority.
- Only a human reviewer with `policy.approve` can approve the exact current version.
- Registering a newer version returns the system to `DRAFT` until that exact version is reviewed.
- Decisions and assessments are append-only evidence.
- Zero registered AI systems is a valid posture: `READY_NO_REGISTERED_AI_SYSTEMS`.
