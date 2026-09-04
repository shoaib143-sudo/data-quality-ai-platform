with definitions(agent_key,name,description,system_prompt,configuration) as (
  values
    ('steward_agent','Steward Agent','Read-only stewardship assistant for ownership, glossary, classifications, issues and data-quality evidence.','Act as a governed data steward. Use only project-scoped evidence supplied by approved tools. Do not mutate production state. Clearly distinguish observed facts from recommendations.',jsonb_build_object('execution_mode','deterministic_read_only','executor','governance-read-agent','role','STEWARD','mutation_allowed',false,'max_tool_calls',1)),
    ('governance_analyst_agent','Governance Analyst Agent','Read-only governance analyst for controls, issues, policy evidence, quality and operational health.','Act as a governance analyst. Summarize project-scoped governance evidence, risks and gaps. Do not mutate state or invent evidence.',jsonb_build_object('execution_mode','deterministic_read_only','executor','governance-read-agent','role','GOVERNANCE_ANALYST','mutation_allowed',false,'max_tool_calls',1)),
    ('architect_agent','Architect Agent','Read-only architecture assistant for sources, datasets, lineage, contracts and platform data-plane posture.','Act as a data governance architect. Analyze project-scoped architecture, lineage and control evidence. Do not mutate state.',jsonb_build_object('execution_mode','deterministic_read_only','executor','governance-read-agent','role','ARCHITECT','mutation_allowed',false,'max_tool_calls',1)),
    ('investigator_agent','Investigator Agent','Read-only investigation assistant for findings, incidents, issues, lineage impact and remediation evidence.','Act as an investigator. Correlate only supplied project evidence, identify likely areas for follow-up, and avoid unsupported causal claims.',jsonb_build_object('execution_mode','deterministic_read_only','executor','governance-read-agent','role','INVESTIGATOR','mutation_allowed',false,'max_tool_calls',1)),
    ('executive_agent','Executive Agent','Read-only executive governance assistant for project health, risk, quality and operational summaries.','Act as an executive governance assistant. Produce concise evidence-based summaries of project health, quality, risk and operational posture. Do not mutate state.',jsonb_build_object('execution_mode','deterministic_read_only','executor','governance-read-agent','role','EXECUTIVE','mutation_allowed',false,'max_tool_calls',1)),
    ('support_agent','Support Agent','Read-only support assistant for explaining project status, recent failures and next operational actions.','Act as a support assistant. Explain project-scoped operational evidence and safe next actions. Never modify data or disclose secrets.',jsonb_build_object('execution_mode','deterministic_read_only','executor','governance-read-agent','role','SUPPORT','mutation_allowed',false,'max_tool_calls',1))
), upserted as (
  insert into agent.agent_definitions(agent_key,name,description,version,system_prompt,configuration,enabled)
  select agent_key,name,description,'1.0',system_prompt,configuration,true from definitions
  on conflict (agent_key,version) do update set
    name=excluded.name,
    description=excluded.description,
    system_prompt=excluded.system_prompt,
    configuration=excluded.configuration,
    enabled=true
  returning id,agent_key
)
insert into agent.tool_definitions(agent_definition_id,tool_key,name,description,version,input_schema,output_schema,execution_config,enabled)
select d.id,
       'read_project_snapshot',
       'Read Project Snapshot',
       'Read a bounded project-scoped governance and data-quality snapshot for deterministic analysis.',
       '1.0',
       '{"type":"object","properties":{"projectId":{"type":"string"},"question":{"type":"string","maxLength":1000}},"required":["projectId"]}'::jsonb,
       '{"type":"object","properties":{"project":{"type":"object"},"counts":{"type":"object"},"recent":{"type":"object"},"health":{"type":"object"}},"required":["project","counts","recent","health"]}'::jsonb,
       jsonb_build_object('executor','governance-read-agent','operation','read_project_snapshot','read_only',true,'idempotent',true,'timeout_ms',30000,'max_retries',1),
       true
from upserted d
on conflict (agent_definition_id,tool_key,version) do update set
  name=excluded.name,
  description=excluded.description,
  input_schema=excluded.input_schema,
  output_schema=excluded.output_schema,
  execution_config=excluded.execution_config,
  enabled=true;
