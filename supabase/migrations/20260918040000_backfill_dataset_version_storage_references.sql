-- Backfill governed storage references for legacy FILE dataset versions.
-- The match is exact, project-scoped, provider-scoped, READY-only, and idempotent.
with matched as (
  select
    dv.id as dataset_version_id,
    so.id as storage_object_id
  from catalog.dataset_versions dv
  join catalog.datasets d
    on d.id = dv.dataset_id
  join catalog.storage_objects so
    on so.project_id = d.project_id
   and so.provider = 'supabase'
   and so.owner_type = 'DATASET_VERSION'
   and so.state = 'READY'
   and (
     dv.source_uri = so.bucket || '/' || so.object_key
     or dv.source_uri = 'storage://' || so.bucket || '/' || so.object_key
   )
  where dv.storage_object_id is null
)
update catalog.dataset_versions dv
set
  storage_object_id = matched.storage_object_id,
  metadata = coalesce(dv.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'storage_object_id', matched.storage_object_id,
      'storage_reference_backfilled', true
    )
from matched
where dv.id = matched.dataset_version_id
  and dv.storage_object_id is null;
