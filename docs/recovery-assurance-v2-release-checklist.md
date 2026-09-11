# Recovery Assurance v2 release checklist

Use this checklist before enabling a full recovery rehearsal in production operations.

- [ ] Required branch gates are green: `build`, `analyze`, `revalidate`, `certify`.
- [ ] Recovery Assurance contract workflow is green.
- [ ] Migration replay succeeds on a clean database.
- [ ] Supabase production project topology matches `infra/recovery/platform-manifest.json`.
- [ ] Required Supabase Edge Functions are present and active.
- [ ] Vercel production project topology and worker cron match the recovery manifest.
- [ ] Render OPA, OTEL, and JDBC bridge services match the recovery manifest and are healthy.
- [ ] GitHub Actions recovery secrets are configured for a deliberately isolated target before any restore rehearsal is dispatched.
- [ ] `RECOVERY_TARGET_DATABASE_URL` cannot resolve to production.
- [ ] Recovery evidence artifact retention is sufficient for governance/audit requirements.
- [ ] A managed Supabase backup/PITR rehearsal is separately scheduled and documented where the current Supabase plan supports it.
- [ ] Storage object bytes have an explicit backup/restore mechanism and integrity validation before the `STORAGE` scope can pass.
- [ ] Auth/SSO/SMTP/JWT/API-key configuration inventory is available before `IDENTITY_CONFIG` can pass.
- [ ] Vercel/Render/environment configuration recovery has been tested before `APPLICATION_CONFIG` can pass.
- [ ] Edge Functions have been restored/redeployed and validated before `EDGE_RUNTIME` can pass.
- [ ] OPA, OTEL, JDBC/search/model/email/identity dependencies are validated before `DEPENDENCIES` can pass.
- [ ] End-to-end health, authentication, catalog, profiling, queue/worker, governance and AI-routing checks pass before `SERVICE_VALIDATION` and `service_ready_at` are recorded.
- [ ] Measured RPO is derived from an authoritative recovery point timestamp.
- [ ] Measured RTO ends at full service readiness, not database restore completion.
- [ ] `governance.recovery_readiness(project_id)` returns `READY` only after all required scopes, external evidence, and timing evidence pass.
