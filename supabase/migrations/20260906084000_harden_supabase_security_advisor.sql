-- Close externally exposed database surfaces while preserving intended service-only control-plane access.

-- Views exposed through PostgREST must evaluate permissions and RLS as the caller,
-- not as the view owner.
alter view catalog.current_discovered_assets set (security_invoker = true);
alter view governance.classification_catalog_coverage set (security_invoker = true);
alter view governance.classification_dataset_coverage set (security_invoker = true);
alter view governance.privacy_control_hooks set (security_invoker = true);

-- These are read models. Browser roles must never mutate physical catalog or governance
-- state through an updatable view.
revoke insert, update, delete on catalog.current_discovered_assets from anon, authenticated;
revoke insert, update, delete on governance.classification_catalog_coverage from anon, authenticated;
revoke insert, update, delete on governance.classification_dataset_coverage from anon, authenticated;
revoke insert, update, delete on governance.privacy_control_hooks from anon, authenticated;

grant select on catalog.current_discovered_assets to authenticated, service_role;
grant select on governance.classification_catalog_coverage to authenticated, service_role;
grant select on governance.classification_dataset_coverage to authenticated, service_role;
grant select on governance.privacy_control_hooks to authenticated, service_role;

-- Physical discovery mutation helpers are internal ingestion machinery. Remove implicit
-- PUBLIC/browser execution while retaining service-role ingestion and trigger operation.
alter function catalog.prepare_discovered_asset_version() set search_path = '';
revoke all on function catalog.prepare_discovered_asset_version() from public;
revoke execute on function catalog.prepare_discovered_asset_version() from anon, authenticated;
grant execute on function catalog.prepare_discovered_asset_version() to service_role;

alter function catalog.reconcile_discovered_assets(uuid, uuid, jsonb) set search_path = '';
revoke all on function catalog.reconcile_discovered_assets(uuid, uuid, jsonb) from public;
revoke execute on function catalog.reconcile_discovered_assets(uuid, uuid, jsonb) from anon, authenticated;
grant execute on function catalog.reconcile_discovered_assets(uuid, uuid, jsonb) to service_role;

-- These tables are intentionally service-only. Explicit deny policies document that
-- boundary and avoid an ambiguous "RLS enabled with no policy" posture. service_role
-- continues to use its RLS-bypass authority for trusted server-side operations.
create policy discovery_checkpoints_service_only
on catalog.discovery_checkpoints
for all to anon, authenticated
using (false)
with check (false);

create policy discovery_staging_assets_service_only
on catalog.discovery_staging_assets
for all to anon, authenticated
using (false)
with check (false);

create policy autonomy_actions_service_only
on governance.autonomy_actions
for all to anon, authenticated
using (false)
with check (false);

create policy autonomy_policies_service_only
on governance.autonomy_policies
for all to anon, authenticated
using (false)
with check (false);

create policy business_context_assets_service_only
on governance.business_context_assets
for all to anon, authenticated
using (false)
with check (false);

create policy dataset_business_context_links_service_only
on governance.dataset_business_context_links
for all to anon, authenticated
using (false)
with check (false);

create policy governance_risk_predictions_service_only
on governance.governance_risk_predictions
for all to anon, authenticated
using (false)
with check (false);

create policy analytics_events_service_only
on orchestration.analytics_events
for all to anon, authenticated
using (false)
with check (false);

create policy object_artifacts_service_only
on orchestration.object_artifacts
for all to anon, authenticated
using (false)
with check (false);

create policy projection_outbox_service_only
on orchestration.projection_outbox
for all to anon, authenticated
using (false)
with check (false);
