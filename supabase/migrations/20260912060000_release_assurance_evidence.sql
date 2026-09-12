create table if not exists app.release_assurance_evidence (
  id uuid primary key default gen_random_uuid(),
  release_id text not null,
  source_commit_sha text not null,
  asserted_claim_level text not null,
  authority_state text not null default 'EVIDENCE_ONLY',
  evidence jsonb not null,
  evidence_hash text not null,
  recorded_at timestamptz not null default now(),
  constraint release_assurance_source_commit_check check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  constraint release_assurance_asserted_claim_level_check check (asserted_claim_level in ('IMPLEMENTED','CERTIFIED','PRODUCTION_VERIFIED')),
  constraint release_assurance_authority_state_check check (authority_state = 'EVIDENCE_ONLY'),
  constraint release_assurance_evidence_hash_check check (evidence_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint release_assurance_evidence_hash_matches check (
    evidence_hash = 'sha256:' || encode(extensions.digest(convert_to(evidence::text, 'UTF8'), 'sha256'), 'hex')
  ),
  constraint release_assurance_release_claim_unique unique (release_id, asserted_claim_level)
);

alter table app.release_assurance_evidence enable row level security;

revoke all on table app.release_assurance_evidence from public, anon, authenticated, service_role;
grant select on table app.release_assurance_evidence to service_role;

create or replace function app.release_assurance_evidence_append_only()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'app'
as $$
begin
  raise exception 'Release assurance evidence is append-only';
end;
$$;

revoke execute on function app.release_assurance_evidence_append_only() from public, anon, authenticated, service_role;

drop trigger if exists release_assurance_evidence_append_only on app.release_assurance_evidence;
create trigger release_assurance_evidence_append_only
before update or delete on app.release_assurance_evidence
for each row execute function app.release_assurance_evidence_append_only();

create or replace function app.record_release_assurance_evidence(
  p_release_id text,
  p_source_commit_sha text,
  p_asserted_claim_level text,
  p_evidence jsonb
)
returns app.release_assurance_evidence
language plpgsql
security definer
set search_path = 'pg_catalog', 'app', 'extensions'
as $$
declare
  v_hash text;
  v_existing app.release_assurance_evidence;
  v_created app.release_assurance_evidence;
begin
  if coalesce(trim(p_release_id), '') = '' then
    raise exception 'Release id is required';
  end if;
  if p_source_commit_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'Source commit must be an exact 40-character SHA';
  end if;
  if p_asserted_claim_level not in ('IMPLEMENTED','CERTIFIED','PRODUCTION_VERIFIED') then
    raise exception 'Unsupported release assurance claim level';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'Release assurance evidence must be a JSON object';
  end if;

  v_hash := 'sha256:' || encode(extensions.digest(convert_to(p_evidence::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing
  from app.release_assurance_evidence
  where release_id = p_release_id
    and asserted_claim_level = p_asserted_claim_level;

  if found then
    if v_existing.source_commit_sha <> p_source_commit_sha or v_existing.evidence_hash <> v_hash then
      raise exception 'Release assurance evidence assertion is immutable once recorded';
    end if;
    return v_existing;
  end if;

  if p_asserted_claim_level = 'CERTIFIED'
     and not exists (
       select 1
       from app.release_assurance_evidence
       where release_id = p_release_id
         and source_commit_sha = p_source_commit_sha
         and asserted_claim_level = 'IMPLEMENTED'
     ) then
    raise exception 'CERTIFIED requires a matching IMPLEMENTED assertion for the same release and source commit';
  end if;

  if p_asserted_claim_level = 'PRODUCTION_VERIFIED'
     and not exists (
       select 1
       from app.release_assurance_evidence
       where release_id = p_release_id
         and source_commit_sha = p_source_commit_sha
         and asserted_claim_level = 'CERTIFIED'
     ) then
    raise exception 'PRODUCTION_VERIFIED requires a matching CERTIFIED assertion for the same release and source commit';
  end if;

  insert into app.release_assurance_evidence(
    release_id,
    source_commit_sha,
    asserted_claim_level,
    authority_state,
    evidence,
    evidence_hash
  ) values (
    p_release_id,
    p_source_commit_sha,
    p_asserted_claim_level,
    'EVIDENCE_ONLY',
    p_evidence,
    v_hash
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke execute on function app.record_release_assurance_evidence(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function app.record_release_assurance_evidence(text,text,text,jsonb) to service_role;

create index if not exists release_assurance_source_recorded_idx
  on app.release_assurance_evidence (source_commit_sha, recorded_at desc);

select pg_notify('pgrst','reload schema');
