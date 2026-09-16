with legacy_objects as (
  select
    p.id as project_id,
    o.bucket_id as bucket,
    o.name as object_key,
    nullif(o.metadata ->> 'mimetype', '') as content_type,
    case
      when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint
      else null
    end as size_bytes,
    nullif(trim(both '"' from coalesce(o.metadata ->> 'eTag', '')), '') as etag,
    o.created_at
  from storage.objects o
  join app.projects p
    on p.id::text = split_part(o.name, '/', 2)
  where o.bucket_id = 'dataset-files'
    and o.name ~ '^projects/[0-9a-fA-F-]{36}/uploads/[^/]+$'
)
insert into catalog.storage_objects (
  project_id,
  provider,
  bucket,
  object_key,
  object_type,
  owner_type,
  original_filename,
  content_type,
  expected_size_bytes,
  size_bytes,
  etag,
  state,
  metadata,
  created_at,
  updated_at
)
select
  project_id,
  'supabase',
  bucket,
  object_key,
  'DATASET_SOURCE',
  'LEGACY_UPLOAD',
  null,
  content_type,
  size_bytes,
  size_bytes,
  etag,
  'UPLOADED',
  jsonb_build_object(
    'legacy_backfill', true,
    'backfill_source', 'storage.objects',
    'requires_verification', true
  ),
  created_at,
  now()
from legacy_objects
on conflict (provider, bucket, object_key) do nothing;
