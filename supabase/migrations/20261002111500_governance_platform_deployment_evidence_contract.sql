begin;

-- Forward-only repair for the governance platform evidence contract.
-- The runtime groups evidence by deployment_id; preserve migration history and
-- add/backfill the missing column rather than rewriting the original migration.
alter table governance.platform_execution_evidence
  add column if not exists deployment_id text;

update governance.platform_execution_evidence
set deployment_id = plan_id
where deployment_id is null or btrim(deployment_id) = '';

alter table governance.platform_execution_evidence
  alter column deployment_id set not null;

create index if not exists platform_execution_evidence_deployment_idx
  on governance.platform_execution_evidence(project_id, deployment_id, recorded_at asc);

-- Evidence is append-only. Enforce that at the database layer as well as ACLs.
create or replace function governance.prevent_platform_execution_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'Governance platform execution evidence is append-only.';
end;
$function$;

drop trigger if exists platform_execution_evidence_immutable
  on governance.platform_execution_evidence;
create trigger platform_execution_evidence_immutable
before update or delete on governance.platform_execution_evidence
for each row execute function governance.prevent_platform_execution_evidence_mutation();

revoke all on function governance.prevent_platform_execution_evidence_mutation()
  from public, anon, authenticated;

do $block$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'governance'
      and table_name = 'platform_execution_evidence'
      and column_name = 'deployment_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'Governance platform deployment evidence contract was not installed.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'governance.platform_execution_evidence'::regclass
      and tgname = 'platform_execution_evidence_immutable'
      and not tgisinternal
  ) then
    raise exception 'Governance platform evidence immutability trigger was not installed.';
  end if;
end;
$block$;

commit;
