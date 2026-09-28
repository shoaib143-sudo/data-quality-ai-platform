-- Immutable benchmark dataset manifests. A held-out claim is only valid when
-- every bound evaluation case resolves to a sealed manifest row.
create table agent.learning_benchmark_dataset_manifests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_key text not null,
  dataset_version text not null,
  source_snapshot_ref text not null,
  split_seed text not null,
  manifest_hash text not null check (manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
  evidence_cutoff_at timestamptz not null,
  case_count integer not null check (case_count > 0),
  training_case_count integer not null check (training_case_count > 0),
  held_out_case_count integer not null check (held_out_case_count > 0),
  status text not null default 'SEALED' check (status = 'SEALED'),
  created_at timestamptz not null default now(),
  constraint learning_benchmark_dataset_manifest_key_ck check (length(btrim(dataset_key)) > 0),
  constraint learning_benchmark_dataset_manifest_version_ck check (length(btrim(dataset_version)) > 0),
  constraint learning_benchmark_dataset_manifest_snapshot_ck check (length(btrim(source_snapshot_ref)) > 0),
  constraint learning_benchmark_dataset_manifest_seed_ck check (length(btrim(split_seed)) > 0),
  constraint learning_benchmark_dataset_manifest_counts_ck check (case_count = training_case_count + held_out_case_count),
  constraint learning_benchmark_dataset_manifest_key_uq unique (project_id, dataset_key),
  constraint learning_benchmark_dataset_manifest_id_project_uq unique (id, project_id)
);

create table agent.learning_benchmark_dataset_cases (
  dataset_id uuid not null references agent.learning_benchmark_dataset_manifests(id) on delete restrict,
  project_id uuid not null,
  case_key text not null check (case_key ~ '^[a-f0-9]{64}$'),
  split text not null check (split in ('TRAINING','HELD_OUT')),
  source_case_ref text not null check (length(btrim(source_case_ref)) > 0),
  created_at timestamptz not null default now(),
  primary key (dataset_id, case_key),
  unique (project_id, dataset_id, case_key),
  constraint learning_benchmark_dataset_case_project_fk
    foreign key (dataset_id, project_id)
    references agent.learning_benchmark_dataset_manifests(id, project_id)
    on delete restrict
);

create index learning_benchmark_dataset_cases_lookup_idx
  on agent.learning_benchmark_dataset_cases(project_id, dataset_id, split);

alter table agent.learning_benchmark_dataset_manifests enable row level security;
alter table agent.learning_benchmark_dataset_cases enable row level security;
create policy learning_benchmark_dataset_manifests_project_read
  on agent.learning_benchmark_dataset_manifests for select to authenticated
  using (app_private.is_project_member(project_id));
create policy learning_benchmark_dataset_cases_project_read
  on agent.learning_benchmark_dataset_cases for select to authenticated
  using (app_private.is_project_member(project_id));
revoke all on agent.learning_benchmark_dataset_manifests from public, anon, authenticated, service_role;
revoke all on agent.learning_benchmark_dataset_cases from public, anon, authenticated, service_role;
grant select on agent.learning_benchmark_dataset_manifests to authenticated, service_role;
grant select on agent.learning_benchmark_dataset_cases to authenticated, service_role;

create or replace function agent.reject_learning_benchmark_dataset_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, agent
as $$ begin raise exception 'Benchmark dataset manifests are immutable'; end; $$;
revoke all on function agent.reject_learning_benchmark_dataset_mutation() from public, anon, authenticated, service_role;
create trigger reject_learning_benchmark_dataset_manifest_mutation
before update or delete on agent.learning_benchmark_dataset_manifests
for each row execute function agent.reject_learning_benchmark_dataset_mutation();
create trigger reject_learning_benchmark_dataset_case_mutation
before update or delete on agent.learning_benchmark_dataset_cases
for each row execute function agent.reject_learning_benchmark_dataset_mutation();

-- Registration is atomic: callers provide the complete manifest once, and no
-- later operation can add, remove, or reclassify a case.
create or replace function agent.register_learning_benchmark_dataset(
  p_project_id uuid,
  p_dataset_key text,
  p_dataset_version text,
  p_source_snapshot_ref text,
  p_split_seed text,
  p_manifest_hash text,
  p_evidence_cutoff_at timestamptz,
  p_cases jsonb
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_id uuid;
  v_case jsonb;
  v_case_count integer;
  v_training integer;
  v_held_out integer;
  v_calculated_hash text;
begin
  if p_project_id is null or p_evidence_cutoff_at is null then raise exception 'project and evidence cutoff are required'; end if;
  if length(btrim(coalesce(p_dataset_key,''))) = 0 or length(btrim(coalesce(p_dataset_version,''))) = 0 then raise exception 'dataset key and version are required'; end if;
  if length(btrim(coalesce(p_source_snapshot_ref,''))) = 0 or length(btrim(coalesce(p_split_seed,''))) = 0 then raise exception 'source snapshot and split seed are required'; end if;
  if p_manifest_hash is null or p_manifest_hash !~ '^sha256:[0-9a-f]{64}$' then raise exception 'manifest hash must be sha256'; end if;
  if jsonb_typeof(p_cases) <> 'array' or jsonb_array_length(p_cases) = 0 then raise exception 'complete dataset cases are required'; end if;
  if exists (select 1 from agent.learning_benchmark_dataset_manifests where project_id = p_project_id and dataset_key = btrim(p_dataset_key)) then raise exception 'dataset key is immutable and already registered'; end if;

  v_case_count := jsonb_array_length(p_cases);
  v_training := 0;
  v_held_out := 0;
  if (select count(distinct value->>'case_key') from jsonb_array_elements(p_cases)) <> v_case_count then raise exception 'dataset case keys must be unique'; end if;
  for v_case in select value from jsonb_array_elements(p_cases) loop
    if v_case->>'case_key' is null or v_case->>'case_key' !~ '^[a-f0-9]{64}$' then raise exception 'each case requires a SHA-256 case key'; end if;
    if v_case->>'source_case_ref' is null or length(btrim(v_case->>'source_case_ref')) = 0 then raise exception 'each case requires an opaque source case reference'; end if;
    if v_case->>'split' = 'TRAINING' then v_training := v_training + 1;
    elsif v_case->>'split' = 'HELD_OUT' then v_held_out := v_held_out + 1;
    else raise exception 'case split must be TRAINING or HELD_OUT'; end if;
  end loop;
  if v_training = 0 or v_held_out = 0 then raise exception 'dataset requires both training and held-out cases'; end if;
  v_calculated_hash := 'sha256:' || encode(extensions.digest((select string_agg((value->>'case_key') || ':' || (value->>'split') || ':' || (value->>'source_case_ref'), '|' order by value->>'case_key') from jsonb_array_elements(p_cases)), 'sha256'), 'hex');
  if v_calculated_hash <> p_manifest_hash then raise exception 'manifest hash does not match canonical case manifest'; end if;

  insert into agent.learning_benchmark_dataset_manifests(project_id, dataset_key, dataset_version, source_snapshot_ref, split_seed, manifest_hash, evidence_cutoff_at, case_count, training_case_count, held_out_case_count)
  values (p_project_id, btrim(p_dataset_key), btrim(p_dataset_version), btrim(p_source_snapshot_ref), btrim(p_split_seed), p_manifest_hash, p_evidence_cutoff_at, v_case_count, v_training, v_held_out)
  returning id into v_id;
  for v_case in select value from jsonb_array_elements(p_cases) loop
    insert into agent.learning_benchmark_dataset_cases(dataset_id, project_id, case_key, split, source_case_ref)
    values (v_id, p_project_id, v_case->>'case_key', v_case->>'split', btrim(v_case->>'source_case_ref'));
  end loop;
  return v_id;
end; $$;
revoke all on function agent.register_learning_benchmark_dataset(uuid,text,text,text,text,text,timestamptz,jsonb) from public, anon, authenticated, service_role;
grant execute on function agent.register_learning_benchmark_dataset(uuid,text,text,text,text,text,timestamptz,jsonb) to service_role;
grant execute on function agent.register_learning_benchmark_dataset(uuid,text,text,text,text,text,timestamptz,jsonb) to service_role;

-- Enforce the manifest at benchmark insert time. Existing case-binding logic
-- persists individual evaluations first; this trigger then rejects a claim
-- unless all cases are present in the immutable HELD_OUT partition.
create or replace function agent.require_learning_benchmark_manifest()
returns trigger language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare
  v_dataset_key text;
  v_manifest_id uuid;
  v_bound_count integer;
begin
  select distinct dataset_key into v_dataset_key from agent.learning_benchmark_case_bindings where benchmark_id = new.id;
  select id into v_manifest_id from agent.learning_benchmark_dataset_manifests where project_id = new.project_id and dataset_key = v_dataset_key;
  if v_manifest_id is null then raise exception 'benchmark requires a registered immutable dataset manifest'; end if;
  select count(distinct b.case_key) into v_bound_count
  from agent.learning_benchmark_case_bindings b
  join agent.learning_benchmark_dataset_cases c on c.dataset_id = v_manifest_id and c.case_key = b.case_key and c.split = 'HELD_OUT'
  where b.benchmark_id = new.id;
  if v_bound_count <> new.case_count then raise exception 'benchmark cases must resolve to the manifest HELD_OUT partition'; end if;
  return new;
end; $$;
revoke all on function agent.require_learning_benchmark_manifest() from public, anon, authenticated, service_role;
create trigger require_learning_benchmark_manifest
after insert on agent.learning_candidate_benchmarks
for each row execute function agent.require_learning_benchmark_manifest();

comment on table agent.learning_benchmark_dataset_manifests is 'Immutable dataset and split manifest for governed held-out evaluation.';
comment on table agent.learning_benchmark_dataset_cases is 'Opaque case digests and immutable TRAINING or HELD_OUT assignments.';
