-- Legacy case rows remain NULL and are not trusted by the new replay reader.
-- Every registration after this migration requires a server-computed payload digest.
alter table agent.learning_benchmark_dataset_cases
  add column payload_hash text;
alter table agent.learning_benchmark_dataset_cases
  add constraint learning_benchmark_dataset_case_payload_hash_ck
  check (payload_hash is null or payload_hash ~ '^sha256:[0-9a-f]{64}$');

-- Length-prefixed UTF-8 fields give SQL and TypeScript the same delimiter-safe
-- canonical digest without relying on JSON serializer formatting.
create or replace function agent.learning_benchmark_manifest_digest(
  p_project_id uuid,
  p_dataset_version text,
  p_cases jsonb
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, agent, extensions
as $$
declare
  v_canonical text;
  v_case jsonb;
  v_field text;
begin
  if p_project_id is null or nullif(btrim(p_dataset_version), '') is null or p_cases is null
    or jsonb_typeof(p_cases) <> 'array' then
    raise exception 'manifest digest scope and case array are required';
  end if;
  v_canonical := '';
  foreach v_field in array array[p_project_id::text, p_dataset_version, jsonb_array_length(p_cases)::text]
  loop
    v_canonical := v_canonical || octet_length(convert_to(v_field, 'UTF8'))::text || ':' || v_field;
  end loop;
  for v_case in
    select value from jsonb_array_elements(p_cases) order by (value->>'case_key') collate "C"
  loop
    foreach v_field in array array[
      v_case->>'case_key', v_case->>'split', v_case->>'source_case_ref', v_case->>'payload_hash'
    ] loop
      if v_field is null then raise exception 'manifest case digest fields are required'; end if;
      v_canonical := v_canonical || octet_length(convert_to(v_field, 'UTF8'))::text || ':' || v_field;
    end loop;
  end loop;
  return 'sha256:' || encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex');
end;
$$;
revoke all on function agent.learning_benchmark_manifest_digest(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function agent.learning_benchmark_manifest_digest(uuid,text,jsonb) to service_role;

-- Replace the old registration contract in place. Old hashless manifests remain
-- immutable history, while all new cases carry byte hashes in their sealed digest.
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
  v_training integer := 0;
  v_held_out integer := 0;
  v_calculated_hash text;
begin
  if p_project_id is null or p_evidence_cutoff_at is null then raise exception 'project and evidence cutoff are required'; end if;
  if length(btrim(coalesce(p_dataset_key,''))) = 0 then raise exception 'dataset key is required'; end if;
  if btrim(coalesce(p_dataset_version,'')) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' then raise exception 'dataset version must be 1-100 ASCII letters, digits, dots, underscores, or hyphens and start with a letter or digit'; end if;
  if length(btrim(coalesce(p_source_snapshot_ref,''))) = 0 or length(btrim(coalesce(p_split_seed,''))) = 0 then raise exception 'source snapshot and split seed are required'; end if;
  if p_manifest_hash is null or p_manifest_hash !~ '^sha256:[0-9a-f]{64}$' then raise exception 'manifest hash must be sha256'; end if;
  if p_cases is null or jsonb_typeof(p_cases) <> 'array' or jsonb_array_length(p_cases) = 0 then raise exception 'complete dataset cases are required'; end if;
  if exists (select 1 from agent.learning_benchmark_dataset_manifests where project_id = p_project_id and dataset_key = btrim(p_dataset_key)) then raise exception 'dataset key is immutable and already registered'; end if;

  v_case_count := jsonb_array_length(p_cases);
  if (select count(distinct value->>'case_key') from jsonb_array_elements(p_cases)) <> v_case_count then raise exception 'dataset case keys must be unique'; end if;
  for v_case in select value from jsonb_array_elements(p_cases) loop
    if v_case->>'case_key' is null or v_case->>'case_key' !~ '^[a-f0-9]{64}$' then raise exception 'each case requires a SHA-256 case key'; end if;
    if v_case->>'source_case_ref' is null or length(btrim(v_case->>'source_case_ref')) = 0 then raise exception 'each case requires an opaque source case reference'; end if;
    if v_case->>'source_case_ref' <> btrim(v_case->>'source_case_ref') then raise exception 'source case references must be normalized'; end if;
    if v_case->>'payload_hash' is null or v_case->>'payload_hash' !~ '^sha256:[0-9a-f]{64}$' then raise exception 'each case requires a SHA-256 payload hash'; end if;
    if v_case->>'split' = 'TRAINING' then v_training := v_training + 1;
    elsif v_case->>'split' = 'HELD_OUT' then v_held_out := v_held_out + 1;
    else raise exception 'case split must be TRAINING or HELD_OUT'; end if;
  end loop;
  if v_training = 0 or v_held_out = 0 then raise exception 'dataset requires both training and held-out cases'; end if;
  v_calculated_hash := agent.learning_benchmark_manifest_digest(p_project_id, btrim(p_dataset_version), p_cases);
  if v_calculated_hash <> p_manifest_hash then raise exception 'manifest hash does not match canonical payload-bound case manifest'; end if;

  insert into agent.learning_benchmark_dataset_manifests(project_id, dataset_key, dataset_version, source_snapshot_ref, split_seed, manifest_hash, evidence_cutoff_at, case_count, training_case_count, held_out_case_count)
  values (p_project_id, btrim(p_dataset_key), btrim(p_dataset_version), btrim(p_source_snapshot_ref), btrim(p_split_seed), p_manifest_hash, p_evidence_cutoff_at, v_case_count, v_training, v_held_out)
  returning id into v_id;
  for v_case in select value from jsonb_array_elements(p_cases) loop
    insert into agent.learning_benchmark_dataset_cases(dataset_id, project_id, case_key, split, source_case_ref, payload_hash)
    values (v_id, p_project_id, v_case->>'case_key', v_case->>'split', btrim(v_case->>'source_case_ref'), v_case->>'payload_hash');
  end loop;
  return v_id;
end;
$$;
revoke all on function agent.register_learning_benchmark_dataset(uuid,text,text,text,text,text,timestamptz,jsonb) from public, anon, authenticated, service_role;
grant execute on function agent.register_learning_benchmark_dataset(uuid,text,text,text,text,text,timestamptz,jsonb) to service_role;

comment on column agent.learning_benchmark_dataset_cases.payload_hash is
  'SHA-256 digest of the exact UTF-8 sealed case bytes. NULL identifies a legacy manifest that cannot be replayed prospectively.';
