-- ADR-006 cost-governance foundation.
--
-- This migration establishes authoritative, append-only provider/model pricing
-- evidence. It deliberately does NOT calculate execution cost, enforce USD
-- budgets, perform FX conversion, or seed provider prices. Runtime cost
-- enforcement remains disabled until an exact approved pricing version is
-- selected by a future governance-approved execution contract.

create table governance.ai_model_pricing_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  provider text not null check (
    provider = lower(btrim(provider)) and provider <> '' and char_length(provider) <= 120
  ),
  model_id text not null check (
    model_id = btrim(model_id) and model_id <> '' and char_length(model_id) <= 300
  ),
  pricing_version text not null check (
    pricing_version = btrim(pricing_version) and pricing_version <> '' and char_length(pricing_version) <= 120
  ),
  supersedes_pricing_id uuid references governance.ai_model_pricing_versions(id),
  currency text not null check (
    currency = upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'
  ),
  input_price_per_million_tokens numeric(24,12) not null check (input_price_per_million_tokens >= 0),
  output_price_per_million_tokens numeric(24,12) not null check (output_price_per_million_tokens >= 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  source_reference text not null check (
    source_reference = btrim(source_reference) and source_reference <> '' and char_length(source_reference) <= 1000
  ),
  source_uri text check (
    source_uri is null or (source_uri = btrim(source_uri) and source_uri <> '' and char_length(source_uri) <= 2000)
  ),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null,
  reviewer_capability text not null default 'policy.approve' check (reviewer_capability = 'policy.approve'),
  review_note text not null check (
    review_note = btrim(review_note) and review_note <> '' and char_length(review_note) <= 4000
  ),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint ai_model_pricing_versions_effective_window_check
    check (effective_to is null or effective_to > effective_from),
  constraint ai_model_pricing_versions_human_authority_check
    check (created_by = reviewed_by and reviewed_at <= created_at),
  constraint ai_model_pricing_versions_identity_unique
    unique (project_id, provider, model_id, currency, pricing_version)
);

create index ai_model_pricing_versions_effective_lookup_idx
  on governance.ai_model_pricing_versions(
    project_id,
    provider,
    model_id,
    currency,
    effective_from desc,
    created_at desc
  );

create index ai_model_pricing_versions_supersedes_idx
  on governance.ai_model_pricing_versions(supersedes_pricing_id)
  where supersedes_pricing_id is not null;

comment on table governance.ai_model_pricing_versions is
  'Append-only, human-reviewed provider/model pricing authority. Evidence only; it does not itself authorize or enforce execution cost.';
comment on column governance.ai_model_pricing_versions.input_price_per_million_tokens is
  'Price for exactly 1,000,000 input tokens in currency. No FX conversion is implied.';
comment on column governance.ai_model_pricing_versions.output_price_per_million_tokens is
  'Price for exactly 1,000,000 output tokens in currency. No FX conversion is implied.';
comment on column governance.ai_model_pricing_versions.provenance is
  'Structured provenance evidence supplied at publication. This is evidence, not an inferred provider price.';

create or replace function governance.reject_ai_model_pricing_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'AI model pricing versions are append-only';
end;
$function$;

create trigger ai_model_pricing_versions_immutable
before update or delete on governance.ai_model_pricing_versions
for each row execute function governance.reject_ai_model_pricing_mutation();

alter table governance.ai_model_pricing_versions enable row level security;

create policy ai_model_pricing_versions_read
on governance.ai_model_pricing_versions
for select
to authenticated
using (app_private.is_project_member(project_id));

revoke all on table governance.ai_model_pricing_versions from anon, authenticated, service_role;
grant select on table governance.ai_model_pricing_versions to authenticated, service_role;

create or replace view governance.ai_model_pricing_effective
with (security_invoker = true)
as
with ranked as (
  select
    p.*,
    row_number() over (
      partition by p.project_id, p.provider, p.model_id, p.currency
      order by p.effective_from desc, p.created_at desc, p.id desc
    ) as pricing_rank
  from governance.ai_model_pricing_versions p
  where p.effective_from <= now()
)
select
  id,
  project_id,
  provider,
  model_id,
  pricing_version,
  supersedes_pricing_id,
  currency,
  1000000::bigint as price_unit_tokens,
  input_price_per_million_tokens,
  output_price_per_million_tokens,
  effective_from,
  effective_to,
  source_reference,
  source_uri,
  provenance,
  reviewed_by,
  reviewed_at,
  reviewer_capability,
  review_note,
  created_by,
  created_at
from ranked
where pricing_rank = 1
  and (effective_to is null or now() < effective_to);

comment on view governance.ai_model_pricing_effective is
  'Deterministic current pricing authority per project/provider/model/currency. Expired latest authority does not fall back to an older version.';

revoke all on table governance.ai_model_pricing_effective from anon, authenticated, service_role;
grant select on table governance.ai_model_pricing_effective to authenticated, service_role;

create or replace function governance.publish_ai_model_pricing(
  p_project_id uuid,
  p_reviewer uuid,
  p_provider text,
  p_model_id text,
  p_pricing_version text,
  p_currency text,
  p_input_price_per_million_tokens numeric,
  p_output_price_per_million_tokens numeric,
  p_effective_from timestamptz,
  p_effective_to timestamptz,
  p_source_reference text,
  p_source_uri text,
  p_provenance jsonb,
  p_review_note text,
  p_supersedes_pricing_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance', 'app', 'app_private'
as $function$
declare
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_model_id text := btrim(coalesce(p_model_id, ''));
  v_pricing_version text := btrim(coalesce(p_pricing_version, ''));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_source_reference text := btrim(coalesce(p_source_reference, ''));
  v_source_uri text := nullif(btrim(coalesce(p_source_uri, '')), '');
  v_review_note text := btrim(coalesce(p_review_note, ''));
  v_previous governance.ai_model_pricing_versions%rowtype;
begin
  if p_reviewer is null then
    raise exception 'AI model pricing publication requires an accountable reviewer';
  end if;
  if not governance.has_project_capability(p_project_id, p_reviewer, 'policy.approve') then
    raise exception 'Reviewer lacks policy.approve';
  end if;
  if v_provider = '' or char_length(v_provider) > 120 then
    raise exception 'Provider is required and must be 120 characters or fewer';
  end if;
  if v_model_id = '' or char_length(v_model_id) > 300 then
    raise exception 'Model id is required and must be 300 characters or fewer';
  end if;
  if v_pricing_version = '' or char_length(v_pricing_version) > 120 then
    raise exception 'Pricing version is required and must be 120 characters or fewer';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter uppercase code';
  end if;
  if p_input_price_per_million_tokens is null or p_input_price_per_million_tokens < 0 then
    raise exception 'Input token price must be non-negative';
  end if;
  if p_output_price_per_million_tokens is null or p_output_price_per_million_tokens < 0 then
    raise exception 'Output token price must be non-negative';
  end if;
  if p_effective_from is null then
    raise exception 'Effective-from timestamp is required';
  end if;
  if p_effective_to is not null and p_effective_to <= p_effective_from then
    raise exception 'Effective-to timestamp must be after effective-from';
  end if;
  if v_source_reference = '' or char_length(v_source_reference) > 1000 then
    raise exception 'Source reference is required and must be 1000 characters or fewer';
  end if;
  if v_source_uri is not null and char_length(v_source_uri) > 2000 then
    raise exception 'Source URI must be 2000 characters or fewer';
  end if;
  if p_provenance is null or jsonb_typeof(p_provenance) <> 'object' then
    raise exception 'Pricing provenance must be a JSON object';
  end if;
  if v_review_note = '' or char_length(v_review_note) > 4000 then
    raise exception 'Human review note is required and must be 4000 characters or fewer';
  end if;

  -- Serialize publication for one canonical pricing identity. Hash collisions only
  -- add harmless serialization; they do not combine authority records.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_project_id::text || E'\x1f' || v_provider || E'\x1f' || v_model_id || E'\x1f' || v_currency,
      0
    )
  );

  if p_supersedes_pricing_id is not null then
    select * into v_previous
    from governance.ai_model_pricing_versions
    where id = p_supersedes_pricing_id
    for share;

    if not found then
      raise exception 'Superseded pricing version was not found';
    end if;
    if v_previous.project_id <> p_project_id
       or v_previous.provider <> v_provider
       or v_previous.model_id <> v_model_id
       or v_previous.currency <> v_currency then
      raise exception 'Superseded pricing version must have the same project, provider, model, and currency';
    end if;
    if p_effective_from < v_previous.effective_from then
      raise exception 'A superseding pricing version cannot become effective before the version it supersedes';
    end if;
  end if;

  insert into governance.ai_model_pricing_versions(
    id,
    project_id,
    provider,
    model_id,
    pricing_version,
    supersedes_pricing_id,
    currency,
    input_price_per_million_tokens,
    output_price_per_million_tokens,
    effective_from,
    effective_to,
    source_reference,
    source_uri,
    provenance,
    reviewed_by,
    reviewed_at,
    reviewer_capability,
    review_note,
    created_by,
    created_at
  ) values (
    v_id,
    p_project_id,
    v_provider,
    v_model_id,
    v_pricing_version,
    p_supersedes_pricing_id,
    v_currency,
    p_input_price_per_million_tokens,
    p_output_price_per_million_tokens,
    p_effective_from,
    p_effective_to,
    v_source_reference,
    v_source_uri,
    p_provenance,
    p_reviewer,
    v_now,
    'policy.approve',
    v_review_note,
    p_reviewer,
    v_now
  );

  insert into governance.audit_events(
    project_id,
    actor_user_id,
    actor_type,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_project_id,
    p_reviewer,
    'USER',
    'AI_MODEL_PRICING_PUBLISHED',
    'AI_MODEL_PRICING_VERSION',
    v_id,
    jsonb_build_object(
      'provider', v_provider,
      'model_id', v_model_id,
      'pricing_version', v_pricing_version,
      'currency', v_currency,
      'price_unit_tokens', 1000000,
      'input_price_per_million_tokens', p_input_price_per_million_tokens,
      'output_price_per_million_tokens', p_output_price_per_million_tokens,
      'effective_from', p_effective_from,
      'effective_to', p_effective_to,
      'source_reference', v_source_reference,
      'supersedes_pricing_id', p_supersedes_pricing_id,
      'required_capability', 'policy.approve',
      'authority_effect', 'PRICING_EVIDENCE_ONLY_NO_RUNTIME_COST_ENFORCEMENT'
    )
  );

  return v_id;
end;
$function$;

revoke all on function governance.publish_ai_model_pricing(
  uuid, uuid, text, text, text, text, numeric, numeric,
  timestamptz, timestamptz, text, text, jsonb, text, uuid
) from public, anon, authenticated;
grant execute on function governance.publish_ai_model_pricing(
  uuid, uuid, text, text, text, text, numeric, numeric,
  timestamptz, timestamptz, text, text, jsonb, text, uuid
) to service_role;

revoke all on function governance.reject_ai_model_pricing_mutation() from public, anon, authenticated, service_role;
