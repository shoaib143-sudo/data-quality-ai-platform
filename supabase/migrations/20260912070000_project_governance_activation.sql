-- Project governance activation is a derived evidence projection only.
-- It distinguishes proposals from authoritative/effective governance state and never mutates domain records.
-- Whole-project ACTIVATED requires complete core-governance coverage across every active dataset.

create or replace function governance.verify_project_governance_activation(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with active_datasets as (
    select d.id
    from catalog.datasets d
    where d.project_id=p_project_id and d.status::text='ACTIVE'
  ), coverage as (
    select
      d.id as dataset_id,
      exists(select 1 from governance.stewardship_assignments s
        where s.project_id=p_project_id and s.dataset_id=d.id
          and s.status='ACTIVE' and s.target_state='CURRENT' and s.subject_state='CURRENT') as stewardship,
      exists(select 1 from governance.dataset_classifications c
        where c.project_id=p_project_id and c.dataset_id=d.id
          and c.status='APPROVED' and c.authority_state='AUTHORITATIVE' and c.target_state='CURRENT') as classification,
      exists(select 1 from governance.glossary_mappings g
        join governance.glossary_terms t on t.id=g.term_id
        where t.project_id=p_project_id and g.dataset_id=d.id
          and g.mapping_status='APPROVED' and g.approved=true and g.validation_state='VALID') as glossary,
      exists(select 1 from governance.cde_mappings c
        where c.project_id=p_project_id and c.dataset_id=d.id and c.status='APPROVED') as cde,
      exists(select 1 from governance.data_contracts c
        where c.project_id=p_project_id and c.dataset_id=d.id and c.status='ACTIVE') as contract,
      exists(select 1 from governance.dataset_certifications c
        where c.project_id=p_project_id and c.dataset_id=d.id and c.certification_status='CERTIFIED'
          and (c.valid_from is null or c.valid_from<=now())
          and (c.valid_until is null or c.valid_until>now())) as certification
    from active_datasets d
  ), summary as (
    select
      count(*)::bigint as active_datasets,
      count(*) filter(where stewardship)::bigint as stewardship_covered,
      count(*) filter(where classification)::bigint as classification_covered,
      count(*) filter(where glossary)::bigint as glossary_covered,
      count(*) filter(where cde)::bigint as cde_covered,
      count(*) filter(where contract)::bigint as contract_covered,
      count(*) filter(where certification)::bigint as certification_covered,
      count(*) filter(where stewardship and classification and glossary and cde and contract and certification)::bigint as fully_core_governed
    from coverage
  ), pending as (
    select
      (select count(*) from governance.stewardship_assignments s where s.project_id=p_project_id and s.status='PROPOSED')::bigint as proposed_stewardship,
      (select count(*) from governance.dataset_classifications c where c.project_id=p_project_id and c.status='SUGGESTED' and c.authority_state='PROPOSED')::bigint as proposed_classifications,
      (select count(*) from governance.glossary_mappings g join governance.glossary_terms t on t.id=g.term_id where t.project_id=p_project_id and g.mapping_status in ('PROPOSED','NEEDS_REVIEW'))::bigint as proposed_glossary_mappings,
      (select count(*) from governance.cde_mappings c where c.project_id=p_project_id and c.status='SUGGESTED')::bigint as suggested_cde_mappings,
      (select count(*) from governance.data_contracts c where c.project_id=p_project_id and c.status='DRAFT')::bigint as draft_contracts,
      (select count(*) from governance.dataset_certifications c where c.project_id=p_project_id and c.certification_status='PROVISIONAL')::bigint as provisional_certifications
  )
  select jsonb_build_object(
    'valid', true,
    'state', case
      when s.active_datasets>0 and s.fully_core_governed=s.active_datasets then 'PROJECT_GOVERNANCE_ACTIVATED'
      when s.active_datasets=0 then 'PROJECT_GOVERNANCE_NOT_ACTIVATED'
      when s.stewardship_covered+s.classification_covered+s.glossary_covered+s.cde_covered+s.contract_covered+s.certification_covered>0 then 'PROJECT_GOVERNANCE_PARTIAL'
      else 'PROJECT_GOVERNANCE_NOT_ACTIVATED'
    end,
    'project_id',p_project_id,
    'authority_semantics','PROPOSALS_NEVER_COUNT_AS_EFFECTIVE_GOVERNANCE',
    'coverage_semantics','PROJECT_ACTIVATION_REQUIRES_EVERY_ACTIVE_DATASET_TO_SATISFY_ALL_CORE_GOVERNANCE_DOMAINS',
    'active_datasets',s.active_datasets,
    'fully_core_governed',s.fully_core_governed,
    'coverage',jsonb_build_object(
      'stewardship',s.stewardship_covered,
      'authoritative_classification',s.classification_covered,
      'approved_glossary_mapping',s.glossary_covered,
      'approved_cde_mapping',s.cde_covered,
      'active_contract',s.contract_covered,
      'active_certification',s.certification_covered
    ),
    'pending',jsonb_build_object(
      'proposed_stewardship',p.proposed_stewardship,
      'proposed_classifications',p.proposed_classifications,
      'proposed_glossary_mappings',p.proposed_glossary_mappings,
      'suggested_cde_mappings',p.suggested_cde_mappings,
      'draft_contracts',p.draft_contracts,
      'provisional_certifications',p.provisional_certifications
    ),
    'blockers',jsonb_strip_nulls(jsonb_build_object(
      'NO_ACTIVE_DATASETS',case when s.active_datasets=0 then true end,
      'INCOMPLETE_STEWARDSHIP_COVERAGE',case when s.stewardship_covered<s.active_datasets then true end,
      'INCOMPLETE_AUTHORITATIVE_CLASSIFICATION_COVERAGE',case when s.classification_covered<s.active_datasets then true end,
      'INCOMPLETE_APPROVED_GLOSSARY_COVERAGE',case when s.glossary_covered<s.active_datasets then true end,
      'INCOMPLETE_APPROVED_CDE_COVERAGE',case when s.cde_covered<s.active_datasets then true end,
      'INCOMPLETE_ACTIVE_CONTRACT_COVERAGE',case when s.contract_covered<s.active_datasets then true end,
      'INCOMPLETE_ACTIVE_CERTIFICATION_COVERAGE',case when s.certification_covered<s.active_datasets then true end
    ))
  )
  from summary s cross join pending p;
$$;

comment on function governance.verify_project_governance_activation(uuid) is
  'Read-only project governance activation projection. PROJECT_GOVERNANCE_ACTIVATED requires complete core-domain coverage across every active dataset; proposal/suggestion/provisional records remain non-effective.';

revoke all on function governance.verify_project_governance_activation(uuid) from public, anon;
grant execute on function governance.verify_project_governance_activation(uuid) to authenticated, service_role;
