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

function writeReconstruction(version, suffix, sql, reason) {
  if (originalVersions.has(version)) throw new Error(`Clean replay reconstruction version collides with released migration ${version}`)
  if (assignedVersions.has(version)) throw new Error(`Clean replay reconstruction version collides with another replay migration ${version}`)
  assignedVersions.add(version)
  const fileName = `${version}_${suffix}.sql`
  fs.writeFileSync(path.join(targetDir, fileName), sql)
  manifest.push({ source: null, replay: fileName, normalized: false, reconstructed: true, transformed: false, reason })
}

const replayTransforms = new Map([
  [
    '20260828000000_job_monitor_operations.sql',
    {
      expected: `create policy agent_run_logs_select_member
on agent.agent_run_logs
for select
to authenticated
using (
  exists (
    select 1
    from agent.agent_runs r
    join catalog.project_members pm on pm.project_id = r.project_id
    where r.id = agent_run_logs.agent_run_id
      and pm.user_id = auth.uid()
  )
);`,
      replacement: `-- Replay compatibility: the original policy depended on catalog.project_members,
-- a transient table absent from the canonical estate. Leave RLS deny-by-default
-- until the later canonical membership policy is applied.`,
      reason: 'Omit obsolete catalog.project_members policy dependency while preserving deny-by-default RLS until the canonical membership policy migration.'
    }
  ]
])

writeReconstruction(
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
  'Released history hardens profiling.dataset_execution_sources before any recorded table creation; reconstruction matches the live table contract.'
)

writeReconstruction(
  '20260902021959',
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
  'Released history normalizes profiling.data_quality_scores before any recorded table creation; reconstruction matches the live table contract.'
)

writeReconstruction(
  '20260902041959',
  'reconstruct_profile_execution_persistence_rpc',
  `begin;
create or replace function profiling.persist_profile_execution_result(
  p_profile_run_id uuid,
  p_metrics jsonb default '[]'::jsonb,
  p_findings jsonb default '[]'::jsonb,
  p_score jsonb default '{}'::jsonb,
  p_status text default 'COMPLETED'::text
) returns void language plpgsql security definer set search_path = pg_catalog, profiling as $function$
begin
  insert into profiling.profile_metrics (profile_run_id,metric_definition_id,profile_column_id,metric_key,numeric_value,text_value,boolean_value,json_value)
  select p_profile_run_id,(m->>'metric_definition_id')::uuid,nullif(m->>'profile_column_id','')::uuid,m->>'metric_key',nullif(m->>'numeric_value','')::numeric,m->>'text_value',nullif(m->>'boolean_value','')::boolean,m->'json_value'
  from jsonb_array_elements(p_metrics) m
  on conflict (profile_run_id,profile_column_id,metric_key) do update set numeric_value=excluded.numeric_value,text_value=excluded.text_value,boolean_value=excluded.boolean_value,json_value=excluded.json_value;
  insert into profiling.profile_findings (profile_run_id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation)
  select p_profile_run_id,nullif(f->>'profile_column_id','')::uuid,f->>'finding_type',f->>'severity',f->>'title',f->>'description',nullif(f->>'confidence','')::numeric,coalesce(f->'evidence','{}'::jsonb),f->'recommendation'
  from jsonb_array_elements(p_findings) f
  where not exists (select 1 from profiling.profile_findings existing where existing.profile_run_id=p_profile_run_id and existing.finding_type=f->>'finding_type' and existing.title=f->>'title');
  insert into profiling.data_quality_scores (profile_run_id,completeness_score,uniqueness_score,validity_score,accuracy_score,overall_score)
  values (p_profile_run_id,nullif(p_score->>'completeness_score','')::numeric,nullif(p_score->>'uniqueness_score','')::numeric,nullif(p_score->>'validity_score','')::numeric,nullif(p_score->>'accuracy_score','')::numeric,nullif(p_score->>'overall_score','')::numeric)
  on conflict (profile_run_id) do update set completeness_score=excluded.completeness_score,uniqueness_score=excluded.uniqueness_score,validity_score=excluded.validity_score,accuracy_score=excluded.accuracy_score,overall_score=excluded.overall_score;
  update profiling.profile_runs set status=p_status,completed_at=now() where id=p_profile_run_id;
end;
$function$;
commit;
`,
  'Released history hardens profiling.persist_profile_execution_result before any recorded function creation; reconstruction matches the live function contract.'
)

writeReconstruction(
  '20260903005957',
  'reconstruct_calculate_quality_score_rpc',
  `begin;
create or replace function profiling.calculate_quality_score(p_profile_run_id uuid)
returns void language plpgsql set search_path = pg_catalog, profiling as $function$
declare
  v_score numeric;
  v_dimension_count integer;
begin
  select coalesce(completeness_score,0)+coalesce(uniqueness_score,0)+coalesce(validity_score,0)+coalesce(accuracy_score,0),
    (case when completeness_score is not null then 1 else 0 end)+(case when uniqueness_score is not null then 1 else 0 end)+(case when validity_score is not null then 1 else 0 end)+(case when accuracy_score is not null then 1 else 0 end)
  into v_score,v_dimension_count from profiling.data_quality_scores where profile_run_id=p_profile_run_id;
  if not found then return; end if;
  update profiling.data_quality_scores set overall_score=case when v_dimension_count>0 then round(v_score/v_dimension_count,4) else null end where profile_run_id=p_profile_run_id;
end;
$function$;
commit;
`,
  'Released history hardens profiling.calculate_quality_score before any recorded function creation; reconstruction matches the live function contract.'
)

writeReconstruction(
  '20260903005958',
  'reconstruct_generate_findings_rpc',
  `begin;
create or replace function profiling.generate_findings(p_profile_run_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, profiling as $function$
begin
  if not exists (select 1 from profiling.profile_runs where id=p_profile_run_id) then raise exception 'Profiling run % was not found.',p_profile_run_id; end if;
  delete from profiling.profile_findings where profile_run_id=p_profile_run_id and finding_type='METRIC_REVIEW';
  insert into profiling.profile_findings(profile_run_id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation)
  select pm.profile_run_id,pm.profile_column_id,'COMPLETENESS',case when pm.numeric_value>=0.5 then 'HIGH' else 'MEDIUM' end,pc.column_name||' has missing values',round(pm.numeric_value*100,4)::text||'% of observed values are null or missing.',1,
    jsonb_build_object('metric_key',pm.metric_key,'null_rate',round(pm.numeric_value,4)),jsonb_build_object('action','review_source_completeness','threshold',0.2)
  from profiling.profile_metrics pm join profiling.profile_columns pc on pc.id=pm.profile_column_id
  where pm.profile_run_id=p_profile_run_id and pm.metric_key='null_rate' and pm.numeric_value>0.2
    and not exists(select 1 from profiling.profile_findings existing where existing.profile_run_id=pm.profile_run_id and existing.profile_column_id=pm.profile_column_id and existing.finding_type='COMPLETENESS' and existing.title=pc.column_name||' has missing values');
  insert into profiling.profile_findings(profile_run_id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation)
  select pm.profile_run_id,pm.profile_column_id,'SENSITIVITY','INFO',pc.column_name||' appears sensitive','Observed values match a known sensitive-data pattern.',round(pm.numeric_value,4),
    jsonb_build_object('metric_key',pm.metric_key,'sensitive_match_rate',round(pm.numeric_value,4)),jsonb_build_object('action','apply_data_classification_and_access_controls')
  from profiling.profile_metrics pm join profiling.profile_columns pc on pc.id=pm.profile_column_id
  where pm.profile_run_id=p_profile_run_id and pm.metric_key='sensitive_match_rate' and pm.numeric_value>=0.8
    and not exists(select 1 from profiling.profile_findings existing where existing.profile_run_id=pm.profile_run_id and existing.profile_column_id=pm.profile_column_id and existing.finding_type='SENSITIVITY' and existing.title=pc.column_name||' appears sensitive');
  insert into profiling.profile_findings(profile_run_id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation)
  select pm.profile_run_id,pm.profile_column_id,'VALIDITY',case when pm.numeric_value<0.5 then 'MEDIUM' else 'LOW' end,pc.column_name||' has pattern mismatches',round((1-pm.numeric_value)*100,4)::text||'% of observed non-null values do not match the detected pattern.',1,
    jsonb_build_object('metric_key',pm.metric_key,'pattern_match_rate',round(pm.numeric_value,4)),jsonb_build_object('action','review_column_format_and_validation_rules')
  from profiling.profile_metrics pm join profiling.profile_columns pc on pc.id=pm.profile_column_id
  where pm.profile_run_id=p_profile_run_id and pm.metric_key='pattern_match_rate' and pm.numeric_value is not null and pm.numeric_value<0.8
    and not exists(select 1 from profiling.profile_findings existing where existing.profile_run_id=pm.profile_run_id and existing.profile_column_id=pm.profile_column_id and existing.finding_type='VALIDITY' and existing.title=pc.column_name||' has pattern mismatches');
end;
$function$;
commit;
`,
  'Released history hardens profiling.generate_findings before any recorded function creation; reconstruction preserves the live deterministic finding contract needed at this replay point.'
)

writeReconstruction(
  '20260903005959',
  'reconstruct_run_profile_rpc',
  `begin;
create or replace function profiling.run_profile(p_dataset_version_id uuid)
returns uuid language plpgsql set search_path = pg_catalog, profiling as $function$
declare v_profile_run_id uuid; v_snapshot_id uuid;
begin
  select ss.id into v_snapshot_id from profiling.schema_snapshots ss where ss.dataset_version_id=p_dataset_version_id order by ss.created_at desc,ss.id desc limit 1;
  if v_snapshot_id is null then raise exception 'No schema snapshot is available for dataset version %',p_dataset_version_id; end if;
  insert into profiling.profile_runs(dataset_version_id,status,engine_name,engine_version,sampling_mode,started_at) values(p_dataset_version_id,'RUNNING','profiling-engine','1.1','FULL',now()) returning id into v_profile_run_id;
  insert into profiling.profile_columns(profile_run_id,column_name,ordinal_position,source_type,inferred_type)
  select v_profile_run_id,c->>'name',ordinality,'schema',c->>'type' from profiling.schema_snapshots ss cross join lateral jsonb_array_elements(ss.schema->'columns') with ordinality as cols(c,ordinality) where ss.id=v_snapshot_id;
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
$function$;
commit;
`,
  'Released history hardens profiling.run_profile before any recorded function creation; reconstruction matches the live function contract.'
)

for (const file of files) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) throw new Error(`Malformed migration filename: ${file}`)
  const originalVersion = file.slice(0,14)
  const replayVersion = nextReplayVersion(originalVersion)
  const targetName = `${replayVersion}_${file.slice(15)}`
  const sourcePath = path.join(sourceDir,file)
  const targetPath = path.join(targetDir,targetName)
  const transform = replayTransforms.get(file)
  let transformed=false
  let transformReason=null
  if (transform) {
    const originalSql=fs.readFileSync(sourcePath,'utf8')
    if (!originalSql.includes(transform.expected)) throw new Error(`Replay compatibility transform no longer matches ${file}`)
    fs.writeFileSync(targetPath,originalSql.replace(transform.expected,transform.replacement))
    transformed=true
    transformReason=transform.reason
  } else fs.copyFileSync(sourcePath,targetPath)
  manifest.push({source:file,replay:targetName,normalized:replayVersion!==originalVersion,reconstructed:false,transformed,reason:transformReason})
}

fs.writeFileSync(path.join(targetDir,'replay-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`)
const normalized=manifest.filter((entry)=>entry.normalized)
const reconstructed=manifest.filter((entry)=>entry.reconstructed)
const transformed=manifest.filter((entry)=>entry.transformed)
console.log(`Prepared ${manifest.length} replay migrations; normalized ${normalized.length} legacy colliding files, reconstructed ${reconstructed.length} historical prerequisites, and transformed ${transformed.length} obsolete dependencies.`)
for (const entry of reconstructed) console.log(`RECONSTRUCTED ${entry.replay}: ${entry.reason}`)
for (const entry of transformed) console.log(`TRANSFORMED ${entry.source} -> ${entry.replay}: ${entry.reason}`)
for (const entry of normalized) console.log(`NORMALIZED ${entry.source} -> ${entry.replay}`)
