-- Harden exact policy/regulatory retrieval so lexical results preserve
-- canonical source provenance, respect current document effectivity, and
-- support exact document/requirement identifiers without trusting metadata
-- fields that callers can supply.

create or replace function governance.search_governance_knowledge_lexical(
  p_project_id uuid,
  p_query text,
  p_limit integer default 25
) returns table (
  object_type text,
  object_key text,
  title text,
  content text,
  metadata jsonb,
  relevance numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
with q as (
  select nullif(trim(p_query), '') query
),
candidates(object_type, object_key, title, content, metadata, relevance) as (
  select
    'KNOWLEDGE_DOCUMENT'::text,
    d.document_key,
    d.title,
    coalesce(d.summary, '') || E'\n' || d.content,
    coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'document_id', d.id,
      'document_key', d.document_key,
      'document_type', d.document_type,
      'domain', d.domain,
      'jurisdiction', d.jurisdiction,
      'effective_at', d.effective_at,
      'expires_at', d.expires_at,
      'source_kind', d.source_kind,
      'source_url', d.source_url,
      'review_status', d.review_status
    ),
    (
      case
        when lower(d.document_key) = lower(q.query) then 1.00
        when lower(d.title) = lower(q.query) then 0.98
        when d.document_key ilike '%' || q.query || '%' then 0.95
        when d.title ilike '%' || q.query || '%' then 0.90
        when coalesce(d.summary, '') ilike '%' || q.query || '%' then 0.78
        when d.content ilike '%' || q.query || '%' then 0.70
        else 0.0
      end
    )::numeric
  from governance.knowledge_documents d
  cross join q
  where d.project_id = p_project_id
    and d.status = 'ACTIVE'
    and q.query is not null
    and (
      d.source_kind = 'SYNTHETIC'
      or coalesce(d.metadata, '{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb
      or d.review_status = 'APPROVED'
    )
    and (d.effective_at is null or d.effective_at <= now())
    and (d.expires_at is null or d.expires_at > now())
    and (
      d.document_key ilike '%' || q.query || '%'
      or d.title ilike '%' || q.query || '%'
      or coalesce(d.summary, '') ilike '%' || q.query || '%'
      or d.content ilike '%' || q.query || '%'
    )

  union all

  select
    'KNOWLEDGE_REQUIREMENT'::text,
    r.requirement_key,
    r.title,
    r.requirement_text,
    coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
      'obligation_type', r.obligation_type,
      'priority', r.priority,
      'document_id', r.document_id,
      'source_document_id', d.id,
      'source_document_key', d.document_key,
      'source_document_title', d.title,
      'source_document_type', d.document_type,
      'source_document_domain', d.domain,
      'source_document_jurisdiction', d.jurisdiction,
      'source_document_effective_at', d.effective_at,
      'source_document_expires_at', d.expires_at,
      'source_document_kind', d.source_kind,
      'source_document_url', d.source_url,
      'source_document_review_status', d.review_status
    ),
    (
      case
        when lower(r.requirement_key) = lower(q.query) then 1.00
        when lower(r.title) = lower(q.query) then 0.98
        when r.requirement_key ilike '%' || q.query || '%' then 0.95
        when r.title ilike '%' || q.query || '%' then 0.90
        else 0.75
      end
    )::numeric
  from governance.knowledge_requirements r
  join governance.knowledge_documents d
    on d.id = r.document_id
   and d.project_id = r.project_id
  cross join q
  where r.project_id = p_project_id
    and d.project_id = p_project_id
    and d.status = 'ACTIVE'
    and q.query is not null
    and (
      d.source_kind = 'SYNTHETIC'
      or coalesce(d.metadata, '{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb
      or d.review_status = 'APPROVED'
    )
    and (d.effective_at is null or d.effective_at <= now())
    and (d.expires_at is null or d.expires_at > now())
    and (
      r.requirement_key ilike '%' || q.query || '%'
      or r.title ilike '%' || q.query || '%'
      or r.requirement_text ilike '%' || q.query || '%'
    )

  union all

  select
    'GLOSSARY_TERM'::text,
    g.id::text,
    g.term,
    g.definition,
    coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
      'domain', g.domain,
      'synonyms', g.synonyms,
      'status', g.status
    ),
    (
      case
        when lower(g.term) = lower(q.query) then 1.00
        when g.term ilike '%' || q.query || '%' then 0.95
        else 0.72
      end
    )::numeric
  from governance.glossary_terms g
  cross join q
  where g.project_id = p_project_id
    and g.status <> 'DEPRECATED'
    and q.query is not null
    and (
      g.term ilike '%' || q.query || '%'
      or g.definition ilike '%' || q.query || '%'
      or array_to_string(g.synonyms, ' ') ilike '%' || q.query || '%'
    )

  union all

  select
    'CRITICAL_DATA_ELEMENT'::text,
    c.cde_key,
    c.name,
    c.definition,
    coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
      'domain', c.domain,
      'criticality', c.criticality,
      'regulatory_relevance', c.regulatory_relevance,
      'owner_role', c.owner_role,
      'steward_role', c.steward_role
    ),
    (
      case
        when lower(c.cde_key) = lower(q.query) then 1.00
        when lower(c.name) = lower(q.query) then 0.98
        when c.cde_key ilike '%' || q.query || '%' then 0.95
        when c.name ilike '%' || q.query || '%' then 0.90
        else 0.74
      end
    )::numeric
  from governance.critical_data_elements c
  cross join q
  where c.project_id = p_project_id
    and c.status = 'ACTIVE'
    and q.query is not null
    and (
      c.cde_key ilike '%' || q.query || '%'
      or c.name ilike '%' || q.query || '%'
      or c.definition ilike '%' || q.query || '%'
    )
)
select object_type, object_key, title, content, metadata, relevance
from candidates
order by relevance desc, title
limit greatest(1, least(coalesce(p_limit, 25), 100));
$function$;

revoke all on function governance.search_governance_knowledge_lexical(uuid, text, integer)
  from public, anon;
grant execute on function governance.search_governance_knowledge_lexical(uuid, text, integer)
  to authenticated, service_role;
