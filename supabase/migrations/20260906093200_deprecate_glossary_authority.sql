-- Deprecation ends current semantic authority while preserving the complete approved history.

create or replace view governance.published_glossary_terms
with (security_invoker=true) as
select distinct on (v.term_id)
  v.term_id as id,v.project_id,v.version_number,v.term,v.definition,v.domain,v.synonyms,
  v.authority_type,v.owner_user_id,v.approved_by,v.approved_at,v.provenance,v.created_at as published_at
from governance.glossary_term_versions v
join governance.glossary_terms current_term on current_term.id=v.term_id
where v.status='APPROVED'
  and v.authority_type <> 'REFERENCE_BOOTSTRAP'
  and current_term.status in ('APPROVED','DRAFT','IN_REVIEW')
  and current_term.authority_type <> 'REFERENCE_BOOTSTRAP'
order by v.term_id,v.version_number desc;

grant select on governance.published_glossary_terms to authenticated,service_role;

create or replace view governance.current_business_semantics
with (security_invoker=true) as
select
  p.project_id,p.id as term_id,p.version_number as term_version_number,p.term,p.definition,p.domain,p.synonyms,
  p.authority_type,p.owner_user_id,p.approved_by,p.approved_at,
  gm.id as mapping_id,gm.target_type,gm.dataset_id,gm.discovered_asset_id,gm.data_source_id,
  gm.catalog_identity_key,gm.column_name,gm.mapping_status,gm.validation_state,gm.origin,gm.confidence,gm.evidence
from governance.published_glossary_terms p
left join governance.glossary_mappings gm
  on gm.term_id=p.id
 and gm.mapping_status='APPROVED'
 and gm.term_version_number=p.version_number;

grant select on governance.current_business_semantics to authenticated,service_role;

create or replace function governance.capture_glossary_term_version()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_next integer;
  v_kind text;
begin
  if tg_op='UPDATE'
     and old.term is not distinct from new.term
     and old.definition is not distinct from new.definition
     and old.domain is not distinct from new.domain
     and old.synonyms is not distinct from new.synonyms
     and old.status is not distinct from new.status
     and old.authority_type is not distinct from new.authority_type
     and old.owner_user_id is not distinct from new.owner_user_id
     and old.approved_by is not distinct from new.approved_by
     and old.approved_at is not distinct from new.approved_at then
    return new;
  end if;

  select coalesce(max(version_number),0)+1 into v_next
  from governance.glossary_term_versions where term_id=new.id;

  if tg_op='INSERT' then
    v_kind := 'CREATED';
  elsif old.authority_type is distinct from new.authority_type then
    v_kind := 'AUTHORITY_CHANGED';
  elsif old.status is distinct from new.status then
    v_kind := 'STATUS_CHANGED';
  else
    v_kind := 'SEMANTIC_CHANGED';
  end if;

  insert into governance.glossary_term_versions(
    term_id,project_id,version_number,term,definition,domain,synonyms,status,authority_type,
    owner_user_id,approved_by,approved_at,change_kind,changed_by,provenance
  ) values (
    new.id,new.project_id,v_next,new.term,new.definition,new.domain,new.synonyms,new.status,new.authority_type,
    new.owner_user_id,new.approved_by,new.approved_at,v_kind,new.last_changed_by,new.provenance
  );

  if new.status='APPROVED' and new.authority_type<>'REFERENCE_BOOTSTRAP' then
    update governance.glossary_mappings
       set mapping_status='NEEDS_REVIEW',approved=false,approved_by=null,reviewed_by=null,reviewed_at=null,updated_at=now()
     where term_id=new.id and mapping_status='APPROVED' and coalesce(term_version_number,0)<>v_next;
  elsif new.status='DEPRECATED' then
    update governance.glossary_mappings
       set mapping_status='NEEDS_REVIEW',approved=false,approved_by=null,reviewed_by=null,reviewed_at=null,updated_at=now()
     where term_id=new.id and mapping_status='APPROVED';
  end if;
  return new;
end;
$function$;

comment on view governance.published_glossary_terms is 'Latest approved historical semantic version for active/revising governed terms; deprecated terms retain history but no longer publish authority.';
