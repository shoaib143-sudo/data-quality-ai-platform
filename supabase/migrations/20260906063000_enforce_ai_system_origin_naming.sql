-- Harden Module 15 AI-system provenance naming.
-- Origin is encoded in the stable system key so synthetic, external, and internal inventory cannot be confused.

update governance.ai_systems s
set
  system_key = case s.system_key
    when 'demo-document-classifier' then 'syn-demo-document-classifier'
    when 'demo-external-llm-service' then 'syn-demo-external-llm-service'
    when 'demo-governance-copilot' then 'syn-demo-governance-copilot'
    when 'demo-governance-rag-pipeline' then 'syn-demo-governance-rag-pipeline'
    else s.system_key
  end,
  name = case s.system_key
    when 'demo-document-classifier' then 'Synthetic Demo Document Classifier'
    when 'demo-external-llm-service' then 'Synthetic Demo External LLM Service'
    when 'demo-governance-copilot' then 'Synthetic Demo Governance Copilot'
    when 'demo-governance-rag-pipeline' then 'Synthetic Demo Governance RAG Pipeline'
    else s.name
  end,
  updated_at = now()
where s.system_key in (
  'demo-document-classifier',
  'demo-external-llm-service',
  'demo-governance-copilot',
  'demo-governance-rag-pipeline'
)
and exists (
  select 1
  from governance.ai_system_versions v
  where v.id = s.current_version_id
    and v.provider = 'DEMO_PROVIDER'
);

alter table governance.ai_systems
  drop constraint if exists ai_systems_origin_qualified_key;

alter table governance.ai_systems
  add constraint ai_systems_origin_qualified_key
  check (system_key ~ '^(int|ext|syn)-[a-z0-9]+(-[a-z0-9]+)*$');

comment on constraint ai_systems_origin_qualified_key on governance.ai_systems is
  'Stable AI system keys must encode inventory origin: int-* internal, ext-* external, syn-* synthetic/demo/test.';
