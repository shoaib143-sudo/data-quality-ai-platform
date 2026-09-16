with referenced as (
  select distinct
    dv.id as dataset_version_id,
    d.project_id,
    o.bucket_id as bucket,
    o.name as object_key,
    nullif(o.metadata->>'mimetype', '') as content_type,
    nullif(o.metadata->>'size', '')::bigint as size_bytes,
    trim(both '"' from coalesce(o.metadata->>'eTag','')) as etag
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  join storage.objects o
    on o.bucket_id = 'dataset-files'
   and dv.source_uri in (
      o.bucket_id || '/' || o.name,
      'storage://' || o.bucket_id || '/' || o.name,
      'supabase://' || o.bucket_id || '/' || o.name
   )
  where dv.storage_object_id is null
), inserted as (
  insert into catalog.storage_objects (
    project_id, provider, bucket, object_key,
    object_type, owner_type, owner_id,
    original_filename, content_type,
    expected_size_bytes, size_bytes, etag,
    state, metadata, verified_at
  )
  select
    r.project_id,
    'supabase',
    r.bucket,
    r.object_key,
    'DATASET_SOURCE',
    'DATASET_VERSION',
    r.dataset_version_id,
    split_part(r.object_key, '/', array_length(string_to_array(r.object_key, '/'), 1)),
    r.content_type,
    r.size_bytes,
    r.size_bytes,
    nullif(r.etag, ''),
    'READY',
    jsonb_build_object('legacy_backfill', true, 'backfilled_from', 'storage.objects'),
    now()
  from referenced r
  on conflict (provider, bucket, object_key) do update
    set owner_type = excluded.owner_type,
        owner_id = excluded.owner_id,
        size_bytes = coalesce(catalog.storage_objects.size_bytes, excluded.size_bytes),
        expected_size_bytes = coalesce(catalog.storage_objects.expected_size_bytes, excluded.expected_size_bytes),
        content_type = coalesce(catalog.storage_objects.content_type, excluded.content_type),
        etag = coalesce(catalog.storage_objects.etag, excluded.etag),
        updated_at = now()
  returning id, bucket, object_key
)
update catalog.dataset_versions dv
set storage_object_id = so.id
from referenced r
join catalog.storage_objects so
  on so.provider = 'supabase'
 and so.bucket = r.bucket
 and so.object_key = r.object_key
where dv.id = r.dataset_version_id
  and dv.storage_object_id is null;
