import fs from 'node:fs'
import path from 'node:path'

const sourceDir = process.env.SOURCE_MIGRATION_DIR || path.join(process.cwd(), 'supabase', 'migrations')
const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(sourceDir)) throw new Error(`SOURCE_MIGRATION_DIR does not exist: ${sourceDir}`)

const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.sql')).sort()
const originalVersions = new Set(files.map((name) => name.slice(0, 14)))
const assignedVersions = new Set()
const perVersionIndex = new Map()
const manifest = []

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })

function nextReplayVersion(original) {
  let index = perVersionIndex.get(original) ?? 0
  while (true) {
    const minute = original.slice(0, 12)
    const second = Number(original.slice(12, 14)) + index
    if (second > 59) throw new Error(`Cannot normalize migration collision ${original}: exhausted second slots`)
    const candidate = `${minute}${String(second).padStart(2, '0')}`
    index += 1
    perVersionIndex.set(original, index)
    const reservedByAnotherOriginal = candidate !== original && originalVersions.has(candidate)
    if (!assignedVersions.has(candidate) && !reservedByAnotherOriginal) {
      assignedVersions.add(candidate)
      return candidate
    }
  }
}

function addReplayReconstruction(version, name, sql, reason) {
  if (originalVersions.has(version) || assignedVersions.has(version)) {
    throw new Error(`Clean replay reconstruction version collides with released/assigned migration ${version}`)
  }
  assignedVersions.add(version)
  const replay = `${version}_${name}.sql`
  fs.writeFileSync(path.join(targetDir, replay), sql)
  manifest.push({ source: null, replay, normalized: false, reconstructed: true, reason })
}

addReplayReconstruction(
  '20260825235959',
  'reconstruct_dataset_execution_sources',
  `begin;
create table if not exists profiling.dataset_execution_sources (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  source_type text not null,
  source_uri text,
  execution_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dataset_execution_sources_version on profiling.dataset_execution_sources(dataset_version_id);
create unique index if not exists dataset_execution_sources_one_active_per_version on profiling.dataset_execution_sources(dataset_version_id) where active = true;
commit;
`,
  'Released history hardens profiling.dataset_execution_sources before any recorded table creation; reconstruction matches the live table contract.',
)

addReplayReconstruction(
  '20260902021500',
  'reconstruct_data_quality_scores',
  `begin;
create table if not exists profiling.data_quality_scores (
  id uuid primary key default gen_random_uuid(),
  profile_run_id uuid not null references profiling.profile_runs(id) on delete cascade,
  completeness_score numeric,
  uniqueness_score numeric,
  validity_score numeric,
  accuracy_score numeric,
  overall_score numeric,
  created_at timestamptz not null default now(),
  constraint profile_quality_scores_unique_run unique (profile_run_id)
);
commit;
`,
  'Released history normalizes profiling.data_quality_scores before any recorded table creation; reconstruction matches the live table and constraint contract.',
)

addReplayReconstruction(
  '20260902041500',
  'reconstruct_persist_profile_execution_result',
  `create or replace function profiling.persist_profile_execution_result(
  p_profile_run_id uuid,
  p_metrics jsonb default '[]'::jsonb,
  p_findings jsonb default '[]'::jsonb,
  p_score jsonb default '{}'::jsonb,
  p_status text default 'COMPLETED'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, profiling
as $$
begin
  insert into profiling.profile_metrics (profile_run_id, metric_definition_id, profile_column_id, metric_key, numeric_value, text_value, boolean_value, json_value)
  select p_profile_run_id, (m->>'metric_definition_id')::uuid, nullif(m->>'profile_column_id','')::uuid, m->>'metric_key', nullif(m->>'numeric_value','')::numeric, m->>'text_value', nullif(m->>'boolean_value','')::boolean, m->'json_value'
  from jsonb_array_elements(p_metrics) m
  on conflict (profile_run_id, profile_column_id, metric_key) do update set numeric_value=excluded.numeric_value, text_value=excluded.text_value, boolean_value=excluded.boolean_value, json_value=excluded.json_value;

  insert into profiling.profile_findings (profile_run_id, profile_column_id, finding_type, severity, title, description, confidence, evidence, recommendation)
  select p_profile_run_id, nullif(f->>'profile_column_id','')::uuid, f->>'finding_type', f->>'severity', f->>'title', f->>'description', nullif(f->>'confidence','')::numeric, coalesce(f->'evidence','{}'::jsonb), f->'recommendation'
  from jsonb_array_elements(p_findings) f
  where not exists (select 1 from profiling.profile_findings existing where existing.profile_run_id=p_profile_run_id and existing.finding_type=f->>'finding_type' and existing.title=f->>'title');

  insert into profiling.data_quality_scores (profile_run_id, completeness_score, uniqueness_score, validity_score, accuracy_score, overall_score)
  values (p_profile_run_id, nullif(p_score->>'completeness_score','')::numeric, nullif(p_score->>'uniqueness_score','')::numeric, nullif(p_score->>'validity_score','')::numeric, nullif(p_score->>'accuracy_score','')::numeric, nullif(p_score->>'overall_score','')::numeric)
  on conflict (profile_run_id) do update set completeness_score=excluded.completeness_score, uniqueness_score=excluded.uniqueness_score, validity_score=excluded.validity_score, accuracy_score=excluded.accuracy_score, overall_score=excluded.overall_score;

  update profiling.profile_runs set status=p_status, completed_at=now() where id=p_profile_run_id;
end;
$$;
`,
  'Released history revokes the profiling persistence RPC before its creation is represented; reconstruction uses the exact live signature and behavior so later hardening applies normally.',
)

addReplayReconstruction(
  '20260903005400',
  'reconstruct_calculate_quality_score',
  `create or replace function profiling.calculate_quality_score(p_profile_run_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, profiling
as $$
declare
  v_score numeric;
  v_dimension_count integer;
begin
  select coalesce(completeness_score, 0)+coalesce(uniqueness_score, 0)+coalesce(validity_score, 0)+coalesce(accuracy_score, 0),
    (case when completeness_score is not null then 1 else 0 end)+(case when uniqueness_score is not null then 1 else 0 end)+(case when validity_score is not null then 1 else 0 end)+(case when accuracy_score is not null then 1 else 0 end)
  into v_score, v_dimension_count
  from profiling.data_quality_scores where profile_run_id = p_profile_run_id;
  if not found then return; end if;
  update profiling.data_quality_scores set overall_score = case when v_dimension_count > 0 then round(v_score / v_dimension_count, 4) else null end where profile_run_id = p_profile_run_id;
end;
$$;
`,
  'Released history hardens profiling.calculate_quality_score before its creation is represented; reconstruction uses the exact live function contract for disposable replay.',
)

addReplayReconstruction(
  '20260903005500',
  'reconstruct_run_profile',
  `create or replace function profiling.run_profile(p_dataset_version_id uuid)
returns uuid
language plpgsql
set search_path = pg_catalog, profiling
as $$
declare
  v_profile_run_id uuid;
  v_snapshot_id uuid;
begin
  select ss.id into v_snapshot_id from profiling.schema_snapshots ss where ss.dataset_version_id = p_dataset_version_id order by ss.created_at desc, ss.id desc limit 1;
  if v_snapshot_id is null then raise exception 'No schema snapshot is available for dataset version %', p_dataset_version_id; end if;
  insert into profiling.profile_runs(dataset_version_id,status,engine_name,engine_version,sampling_mode,started_at) values(p_dataset_version_id,'RUNNING','profiling-engine','1.1','FULL',now()) returning id into v_profile_run_id;
  insert into profiling.profile_columns(profile_run_id,column_name,ordinal_position,source_type,inferred_type)
  select v_profile_run_id,c->>'name',ordinality,'schema',c->>'type' from profiling.schema_snapshots ss cross join lateral jsonb_array_elements(ss.schema->'columns') with ordinality as cols(c, ordinality) where ss.id = v_snapshot_id;
  perform profiling.execute_metrics(v_profile_run_id);
  perform profiling.generate_findings(v_profile_run_id);
  insert into profiling.data_quality_scores(profile_run_id,completeness_score,uniqueness_score,validity_score,accuracy_score) values(v_profile_run_id,0,0,0,0) on conflict do nothing;
  perform profiling.calculate_quality_score(v_profile_run_id);
  update profiling.profile_runs set status='COMPLETED',completed_at=now() where id=v_profile_run_id;
  return v_profile_run_id;
exception when others then
  update profiling.profile_runs set status='FAILED',completed_at=now() where id=v_profile_run_id;
  raise;
end;
$$;
`,
  'Released history hardens profiling.run_profile before its creation is represented; reconstruction uses the exact live function contract so subsequent migrations can harden and replace it.',
)

addReplayReconstruction(
  '20260903225900',
  'reconstruct_create_file_dataset',
  `create or replace function public.create_file_dataset(
  p_project_id uuid,
  p_name text,
  p_filename text,
  p_description text default null,
  p_business_domain text default null
)
returns table(dataset_id uuid, dataset_version_id uuid, data_source_id uuid, version_number bigint, storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, catalog, app_private
as $$
declare
  v_user_id uuid := auth.uid();
  v_dataset_id uuid;
  v_source_id uuid;
  v_version_id uuid;
  v_version_number bigint;
  v_filename text;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if not app_private.is_project_admin(p_project_id) then raise exception using errcode = '42501', message = 'Project administrator access required'; end if;
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 160 then raise exception using errcode = '22023', message = 'Dataset name must be 1-160 characters'; end if;
  if p_filename is null or btrim(p_filename) = '' or length(p_filename) > 255 then raise exception using errcode = '22023', message = 'Filename is required and must be <=255 characters'; end if;
  v_filename := regexp_replace(btrim(p_filename), '[^A-Za-z0-9._-]+', '_', 'g');
  insert into catalog.data_sources(project_id, name, source_type, connection_metadata, status)
  values (p_project_id, btrim(p_name) || ' upload', 'FILE_UPLOAD', jsonb_build_object('storage_bucket','dataset-files'), 'ACTIVE') returning id into v_source_id;
  insert into catalog.datasets(project_id, data_source_id, name, description, source_identifier, owner_user_id, business_domain, status, metadata)
  values (p_project_id, v_source_id, btrim(p_name), nullif(btrim(coalesce(p_description,'')), ''), v_filename, v_user_id, nullif(btrim(coalesce(p_business_domain,'')), ''), 'ACTIVE', jsonb_build_object('ingestion_type','FILE_UPLOAD')) returning id into v_dataset_id;
  select coalesce(max(version_number), 0) + 1 into v_version_number from catalog.dataset_versions where dataset_id = v_dataset_id;
  insert into catalog.dataset_versions(dataset_id, version_number, source_uri, status, metadata)
  values (v_dataset_id, v_version_number, 'supabase://dataset-files/' || p_project_id::text || '/' || v_dataset_id::text || '/' || v_version_number::text || '/' || v_filename, 'PROCESSING', jsonb_build_object('storage_bucket','dataset-files','storage_path',p_project_id::text || '/' || v_dataset_id::text || '/' || v_version_number::text || '/' || v_filename,'original_filename',p_filename,'created_by',v_user_id)) returning id into v_version_id;
  return query select v_dataset_id, v_version_id, v_source_id, v_version_number, 'dataset-files'::text, p_project_id::text || '/' || v_dataset_id::text || '/' || v_version_number::text || '/' || v_filename;
end;
$$;
`,
  'Released history revokes public.create_file_dataset before its creation is represented; reconstruction uses the exact live signature and behavior in disposable replay.',
)

addReplayReconstruction(
  '20260903225910',
  'reconstruct_create_organization',
  `create or replace function public.create_organization(p_name text, p_slug text)
returns table(id uuid, name text, slug text, role app.member_role)
language plpgsql
security definer
set search_path = pg_catalog, public, app, app_private
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 120 then raise exception using errcode = '22023', message = 'Organization name must be 1-120 characters'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 63 then raise exception using errcode = '22023', message = 'Organization slug must be lowercase kebab-case'; end if;
  insert into app.organizations(name, slug) values (btrim(p_name), p_slug) returning app.organizations.id into v_org_id;
  insert into app.organization_members(organization_id, user_id, role) values (v_org_id, v_user_id, 'OWNER');
  return query select o.id, o.name, o.slug, m.role from app.organizations o join app.organization_members m on m.organization_id = o.id where o.id = v_org_id and m.user_id = v_user_id;
end;
$$;
`,
  'Released history revokes public.create_organization before its creation is represented; reconstruction reproduces the exact live historical RPC only in disposable replay.',
)

addReplayReconstruction(
  '20260903225920',
  'reconstruct_create_project',
  `create or replace function public.create_project(p_organization_id uuid, p_name text, p_slug text, p_description text default null)
returns table(id uuid, organization_id uuid, name text, slug text, description text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, app_private
as $$
declare
  v_project_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if not app_private.is_org_admin(p_organization_id) then raise exception using errcode = '42501', message = 'Organization administrator access required'; end if;
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 120 then raise exception using errcode = '22023', message = 'Project name must be 1-120 characters'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 63 then raise exception using errcode = '22023', message = 'Project slug must be lowercase kebab-case'; end if;
  insert into app.projects(organization_id, name, slug, description) values (p_organization_id, btrim(p_name), p_slug, nullif(btrim(coalesce(p_description,'')), '')) returning app.projects.id into v_project_id;
  return query select p.id, p.organization_id, p.name, p.slug, p.description from app.projects p where p.id = v_project_id;
end;
$$;
`,
  'Released history revokes public.create_project before its creation is represented; reconstruction reproduces the exact live historical RPC only in disposable replay.',
)

addReplayReconstruction(
  '20260903225930',
  'reconstruct_get_dataset_version_for_profiling',
  `create or replace function public.get_dataset_version_for_profiling(dataset_version_id uuid)
returns setof catalog.dataset_versions
language sql
security definer
set search_path = public
as $$
  select * from catalog.dataset_versions where id = dataset_version_id;
$$;
`,
  'Released history revokes public.get_dataset_version_for_profiling before its creation is represented; reconstruction reproduces the exact live historical RPC only in disposable replay.',
)

for (const file of files) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) throw new Error(`Malformed migration filename: ${file}`)
  const originalVersion = file.slice(0, 14)
  const replayVersion = nextReplayVersion(originalVersion)
  const suffix = file.slice(15)
  const targetName = `${replayVersion}_${suffix}`
  const sourcePath = path.join(sourceDir, file)
  const targetPath = path.join(targetDir, targetName)
  fs.copyFileSync(sourcePath, targetPath)

  if (file === '20260828000000_job_monitor_operations.sql') {
    const originalSql = fs.readFileSync(targetPath, 'utf8')
    const legacyPolicy = `  exists (\n    select 1\n    from agent.agent_runs r\n    join catalog.project_members pm on pm.project_id = r.project_id\n    where r.id = agent_run_logs.agent_run_id\n      and pm.user_id = auth.uid()\n  )`
    const canonicalPolicy = `  exists (\n    select 1\n    from agent.agent_runs r\n    where r.id = agent_run_logs.agent_run_id\n      and app_private.is_project_member(r.project_id)\n  )`
    if (!originalSql.includes(legacyPolicy)) throw new Error('Historical agent_run_logs membership policy no longer matches the audited replay repair contract')
    fs.writeFileSync(targetPath, originalSql.replace(legacyPolicy, canonicalPolicy))
    manifest.push({ source: file, replay: targetName, normalized: replayVersion !== originalVersion, reconstructed: true, reason: 'Disposable replay replaces obsolete catalog.project_members policy lookup with the canonical foundation app_private.is_project_member helper.' })
    continue
  }

  manifest.push({ source: file, replay: targetName, normalized: replayVersion !== originalVersion, reconstructed: false })
}

fs.writeFileSync(path.join(targetDir, 'replay-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const normalized = manifest.filter((entry) => entry.normalized)
const reconstructed = manifest.filter((entry) => entry.reconstructed)
console.log(`Prepared ${manifest.length} replay entries; normalized ${normalized.length} legacy colliding files and reconstructed/repaired ${reconstructed.length} historical prerequisites.`)
for (const entry of reconstructed) console.log(`RECONSTRUCTED ${entry.replay}: ${entry.reason}`)
for (const entry of normalized) console.log(`NORMALIZED ${entry.source} -> ${entry.replay}`)
