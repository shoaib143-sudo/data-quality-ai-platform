import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260905163658'
const name = 'reconstruct_reconcile_discovered_assets'
const replayPath = path.join(targetDir, `${version}_${name}.sql`)

if (fs.existsSync(replayPath)) {
  throw new Error(`Clean replay already contains ${path.basename(replayPath)}; remove the replay-only recovery when released history contains the canonical production migration`)
}

const sql = `create or replace function catalog.reconcile_discovered_assets(
  p_run_id uuid,
  p_source_id uuid,
  p_assets jsonb
) returns jsonb
language plpgsql
security definer
set search_path = catalog, public
as $$
declare
  item jsonb;
  v_key text;
  v_hash text;
  v_now timestamptz := now();
  v_existing catalog.discovered_assets%rowtype;
  v_seen text[] := array[]::text[];
  v_observed integer := 0;
  v_added integer := 0;
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_retired integer := 0;
begin
  if jsonb_typeof(coalesce(p_assets, '[]'::jsonb)) <> 'array' then
    raise exception 'p_assets must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_assets, '[]'::jsonb))
  loop
    v_observed := v_observed + 1;
    v_key := lower(coalesce(item->>'namespace','') || '.' || coalesce(item->>'name',''));
    v_hash := item->>'content_hash';
    if coalesce(item->>'name','') = '' or coalesce(v_hash,'') = '' then
      raise exception 'Each discovered asset requires name and content_hash';
    end if;
    v_seen := array_append(v_seen, v_key);

    select * into v_existing
    from catalog.discovered_assets
    where source_id = p_source_id and asset_key = v_key and is_current
    for update;

    if not found then
      insert into catalog.discovered_assets(
        discovery_run_id, source_id, asset_type, namespace, name, columns, metadata,
        asset_key, content_hash, version_number, is_current, first_seen_at, last_seen_at, last_seen_run_id, retired_at
      ) values (
        p_run_id, p_source_id, item->>'asset_type', nullif(item->>'namespace',''), item->>'name',
        coalesce(item->'columns','[]'::jsonb), coalesce(item->'metadata','{}'::jsonb),
        v_key, v_hash, 1, true, v_now, v_now, p_run_id, null
      );
      v_added := v_added + 1;
    elsif v_existing.content_hash = v_hash then
      update catalog.discovered_assets
      set last_seen_at = v_now,
          last_seen_run_id = p_run_id,
          metadata = coalesce(item->'metadata', metadata),
          columns = coalesce(item->'columns', columns)
      where id = v_existing.id;
      v_unchanged := v_unchanged + 1;
    else
      update catalog.discovered_assets
      set is_current = false,
          retired_at = v_now,
          last_seen_at = v_now,
          last_seen_run_id = p_run_id
      where id = v_existing.id;

      insert into catalog.discovered_assets(
        discovery_run_id, source_id, asset_type, namespace, name, columns, metadata,
        asset_key, content_hash, version_number, is_current, first_seen_at, last_seen_at, last_seen_run_id, retired_at
      ) values (
        p_run_id, p_source_id, item->>'asset_type', nullif(item->>'namespace',''), item->>'name',
        coalesce(item->'columns','[]'::jsonb), coalesce(item->'metadata','{}'::jsonb),
        v_key, v_hash, v_existing.version_number + 1, true, v_existing.first_seen_at, v_now, p_run_id, null
      );
      v_changed := v_changed + 1;
    end if;
  end loop;

  update catalog.discovered_assets
  set is_current = false,
      retired_at = v_now
  where source_id = p_source_id
    and is_current
    and not (asset_key = any(v_seen));
  get diagnostics v_retired = row_count;

  return jsonb_build_object(
    'observed', v_observed,
    'added', v_added,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'retired', v_retired,
    'current', (select count(*) from catalog.discovered_assets where source_id = p_source_id and is_current)
  );
end;
$$;
`

fs.writeFileSync(replayPath, sql)
console.log(`RECONSTRUCTED ${path.basename(replayPath)}: production migration 20260905163658 created catalog.reconcile_discovered_assets before later security hardening; released Git history retained the table/versioning changes but omitted this RPC.`)
