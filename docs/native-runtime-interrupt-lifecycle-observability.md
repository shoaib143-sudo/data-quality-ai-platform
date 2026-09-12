# Native runtime interrupt lifecycle observability

The scheduled worker response exposes interrupt sweep counts and per-interrupt outcomes/failures. Terminal actions and late decisions are persisted as append-only database evidence, providing durable audit lineage across deployments.
