-- ADR-006 canonical AI model cost accounting.
-- Pricing is configuration evidence. This migration intentionally seeds no prices.

create table if not exists governance.ai_model_pricing_versions (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null check (length(btrim(provider_id)) > 0),
  model_name text not null check (length(btrim(model_name)) > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  input_cost_per_million_tokens numeric(20,10) not null check (input_cost_per_million_tokens >= 0),
  output_cost_per_million_tokens numeric(20,10) not null check (output_cost_per_million_tokens >= 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  source_reference text not null check (length(btrim(source_reference)) > 0),
  source_note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint ai_model_pricing_versions_effective_window check (effective_to is null or effective_to > effective_from),
  constraint ai_model_pricing_versions_provider_model_start_unique unique (provider_id, model_name, effective_from)
);

create index if not exists ai_model_pricing_versions_lookup_idx
  on governance.ai_model_pricing_versions (provider_id, model_name, effective_from desc);

create or replace function governance.prevent_ai_model_pricing_overlap()
returns trigger
language plpgsql
security definer
set search_path = governance, pg_temp
as $$
begin
  new.provider_id := btrim(new.provider_id);
  new.model_name := btrim(new.model_name);
  new.currency := upper(btrim(new.currency));
  new.source_reference := btrim(new.source_reference);

  if exists (
    select 1
    from governance.ai_model_pricing_versions existing
    where existing.provider_id = new.provider_id
      and existing.model_name = new.model_name
      and existing.id <> new.id
      and tstzrange(existing.effective_from, existing.effective_to, '[)')
          && tstzrange(new.effective_from, new.effective_to, '[)')
  ) then
    raise exception 'Overlapping AI model pricing interval for provider % and model %', new.provider_id, new.model_name
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function governance.prevent_ai_model_pricing_overlap() from public;

create trigger ai_model_pricing_versions_no_overlap
before insert or update on governance.ai_model_pricing_versions
for each row execute function governance.prevent_ai_model_pricing_overlap();

create table if not exists governance.ai_model_cost_events (
  id uuid primary key default gen_random_uuid(),
  invocation_id uuid not null unique,
  project_id uuid not null references app.projects(id) on delete restrict,
  execution_correlation_id uuid,
  provider_request_id text,
  provider_id text not null check (length(btrim(provider_id)) > 0),
  model_name text not null check (length(btrim(model_name)) > 0),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  total_tokens bigint check (total_tokens is null or total_tokens >= 0),
  pricing_version_id uuid references governance.ai_model_pricing_versions(id) on delete restrict,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  input_cost numeric(20,10) check (input_cost is null or input_cost >= 0),
  output_cost numeric(20,10) check (output_cost is null or output_cost >= 0),
  total_cost numeric(20,10) check (total_cost is null or total_cost >= 0),
  accounting_status text not null check (accounting_status in ('PRICED','USAGE_UNAVAILABLE','PRICE_UNAVAILABLE')),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint ai_model_cost_events_priced_complete check (
    accounting_status <> 'PRICED' or (
      input_tokens is not null and output_tokens is not null and pricing_version_id is not null
      and currency is not null and input_cost is not null and output_cost is not null and total_cost is not null
    )
  ),
  constraint ai_model_cost_events_unpriced_cost_null check (
    accounting_status = 'PRICED' or (
      pricing_version_id is null and currency is null and input_cost is null and output_cost is null and total_cost is null
    )
  )
);

create index if not exists ai_model_cost_events_project_observed_idx
  on governance.ai_model_cost_events (project_id, observed_at desc);
create index if not exists ai_model_cost_events_correlation_idx
  on governance.ai_model_cost_events (execution_correlation_id)
  where execution_correlation_id is not null;
create index if not exists ai_model_cost_events_provider_request_idx
  on governance.ai_model_cost_events (provider_id, provider_request_id)
  where provider_request_id is not null;

create or replace function governance.reject_ai_model_cost_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = governance, pg_temp
as $$
begin
  raise exception 'AI model cost events are immutable audit evidence' using errcode = '55000';
end;
$$;

revoke all on function governance.reject_ai_model_cost_event_mutation() from public;

create trigger ai_model_cost_events_immutable
before update or delete on governance.ai_model_cost_events
for each row execute function governance.reject_ai_model_cost_event_mutation();

create or replace function governance.record_ai_model_cost_event(
  p_invocation_id uuid,
  p_project_id uuid,
  p_execution_correlation_id uuid,
  p_provider_request_id text,
  p_provider_id text,
  p_model_name text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_total_tokens bigint,
  p_observed_at timestamptz
)
returns governance.ai_model_cost_events
language plpgsql
security definer
set search_path = governance, app, pg_temp
as $$
declare
  existing_event governance.ai_model_cost_events%rowtype;
  pricing governance.ai_model_pricing_versions%rowtype;
  pricing_matches integer;
  status text;
  calculated_input_cost numeric(20,10);
  calculated_output_cost numeric(20,10);
  calculated_total_cost numeric(20,10);
begin
  if p_invocation_id is null or p_project_id is null then
    raise exception 'invocation_id and project_id are required' using errcode = '22023';
  end if;
  if p_provider_id is null or length(btrim(p_provider_id)) = 0 or p_model_name is null or length(btrim(p_model_name)) = 0 then
    raise exception 'provider_id and model_name are required' using errcode = '22023';
  end if;
  if p_observed_at is null then
    raise exception 'observed_at is required' using errcode = '22023';
  end if;
  if (p_input_tokens is not null and p_input_tokens < 0)
     or (p_output_tokens is not null and p_output_tokens < 0)
     or (p_total_tokens is not null and p_total_tokens < 0) then
    raise exception 'Observed token counts must be non-negative' using errcode = '22023';
  end if;

  select * into existing_event
  from governance.ai_model_cost_events
  where invocation_id = p_invocation_id;
  if found then
    if existing_event.project_id <> p_project_id
       or existing_event.provider_id <> btrim(p_provider_id)
       or existing_event.model_name <> btrim(p_model_name) then
      raise exception 'invocation_id already belongs to different accounting evidence' using errcode = '23505';
    end if;
    return existing_event;
  end if;

  if not exists (select 1 from app.projects p where p.id = p_project_id) then
    raise exception 'Project not found for AI model cost accounting' using errcode = '23503';
  end if;

  if p_input_tokens is null or p_output_tokens is null then
    status := 'USAGE_UNAVAILABLE';
  else
    select count(*) into pricing_matches
    from governance.ai_model_pricing_versions
    where provider_id = btrim(p_provider_id)
      and model_name = btrim(p_model_name)
      and effective_from <= p_observed_at
      and (effective_to is null or effective_to > p_observed_at);

    if pricing_matches > 1 then
      raise exception 'Ambiguous effective AI model pricing for provider % model % at %', p_provider_id, p_model_name, p_observed_at
        using errcode = '23000';
    elsif pricing_matches = 0 then
      status := 'PRICE_UNAVAILABLE';
    else
      select * into strict pricing
      from governance.ai_model_pricing_versions
      where provider_id = btrim(p_provider_id)
        and model_name = btrim(p_model_name)
        and effective_from <= p_observed_at
        and (effective_to is null or effective_to > p_observed_at);
      status := 'PRICED';
      calculated_input_cost := round((p_input_tokens::numeric / 1000000::numeric) * pricing.input_cost_per_million_tokens, 10);
      calculated_output_cost := round((p_output_tokens::numeric / 1000000::numeric) * pricing.output_cost_per_million_tokens, 10);
      calculated_total_cost := calculated_input_cost + calculated_output_cost;
    end if;
  end if;

  insert into governance.ai_model_cost_events (
    invocation_id, project_id, execution_correlation_id, provider_request_id,
    provider_id, model_name, input_tokens, output_tokens, total_tokens,
    pricing_version_id, currency, input_cost, output_cost, total_cost,
    accounting_status, observed_at
  ) values (
    p_invocation_id, p_project_id, p_execution_correlation_id, nullif(btrim(p_provider_request_id), ''),
    btrim(p_provider_id), btrim(p_model_name), p_input_tokens, p_output_tokens, p_total_tokens,
    case when status = 'PRICED' then pricing.id else null end,
    case when status = 'PRICED' then pricing.currency else null end,
    case when status = 'PRICED' then calculated_input_cost else null end,
    case when status = 'PRICED' then calculated_output_cost else null end,
    case when status = 'PRICED' then calculated_total_cost else null end,
    status, p_observed_at
  )
  returning * into existing_event;

  return existing_event;
end;
$$;

alter table governance.ai_model_pricing_versions enable row level security;
alter table governance.ai_model_cost_events enable row level security;

revoke all on table governance.ai_model_pricing_versions from anon, authenticated;
revoke all on table governance.ai_model_cost_events from anon, authenticated;
grant select, insert, update, delete on table governance.ai_model_pricing_versions to service_role;
grant select, insert on table governance.ai_model_cost_events to service_role;

revoke all on function governance.record_ai_model_cost_event(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,timestamptz) from public, anon, authenticated;
grant execute on function governance.record_ai_model_cost_event(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,timestamptz) to service_role;

comment on table governance.ai_model_pricing_versions is 'Versioned authoritative AI provider/model pricing configuration. No inferred or default prices.';
comment on table governance.ai_model_cost_events is 'Immutable canonical AI invocation cost evidence derived only from observed usage and effective configured pricing.';
comment on function governance.record_ai_model_cost_event(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,timestamptz) is 'Records idempotent AI invocation cost evidence. Missing observed usage or pricing is explicit and never estimated.';
