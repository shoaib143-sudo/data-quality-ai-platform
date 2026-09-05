drop view if exists catalog.current_catalog_assets;
create view catalog.current_catalog_assets with (security_invoker=true) as
select s.scope_id,s.presence_state,s.first_seen_revision_id,s.last_seen_revision_id,s.missing_since_revision_id,s.last_seen_at as scope_last_seen_at,a.*
from catalog.scope_asset_state s
join catalog.discovered_assets a on a.id=s.discovered_asset_id
where s.presence_state='ACTIVE' and a.is_current;

drop view if exists catalog.current_catalog_source_assets;
create view catalog.current_catalog_source_assets with (security_invoker=true) as
select distinct on (a.source_id,a.asset_key)
  a.*,
  s.last_seen_at as scope_last_seen_at
from catalog.scope_asset_state s
join catalog.discovered_assets a on a.id=s.discovered_asset_id
where s.presence_state='ACTIVE' and a.is_current
order by a.source_id,a.asset_key,s.last_seen_at desc nulls last,s.scope_id;

drop view if exists catalog.catalog_revision_changes;
create view catalog.catalog_revision_changes with (security_invoker=true) as
select r.id revision_id,r.project_id,r.source_id,r.scope_id,r.scope_version_id,r.revision_number,r.published_at,r.objects_observed,r.objects_added,r.objects_changed,r.objects_removed,r.objects_missing,r.objects_unchanged,e.id change_event_id,e.asset_key,e.change_type,e.previous_asset_id,e.current_asset_id,e.details
from catalog.catalog_revisions r left join catalog.catalog_change_events e on e.revision_id=r.id;

grant select on catalog.current_catalog_assets,catalog.current_catalog_source_assets,catalog.catalog_revision_changes to authenticated;
