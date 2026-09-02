insert into agent.tool_definitions (
  agent_definition_id,
  tool_key,
  name,
  description,
  version,
  input_schema,
  output_schema,
  execution_config,
  enabled
)
select
  ad.id,
  'investigate_profile',
  'Investigate Profile',
  'Build an evidence-first investigation of persisted profiling findings and quality scores, including probable causes, business issue, business impact, risk, recommendations, and approval requirements.',
  '1.0',
  '{"type":"object","required":["datasetVersionId","profilingRunId"],"properties":{"datasetVersionId":{"type":"string"},"profilingRunId":{"type":"string"}}}'::jsonb,
  '{"type":"object","properties":{"investigation_version":{"type":"string"},"technical_summary":{"type":"string"},"probable_root_causes":{"type":"array"},"business_issue":{"type":"string"},"business_impact":{"type":"string"},"risk":{"type":"string"},"recommendations":{"type":"array"},"approval_required":{"type":"boolean"},"confidence":{"type":"number"},"evidence":{"type":"array"}}}'::jsonb,
  '{"executor":"profiling-executor"}'::jsonb,
  true
from agent.agent_definitions ad
where ad.agent_key = 'profiling_agent'
  and ad.version = '2.0'
  and not exists (
    select 1
    from agent.tool_definitions td
    where td.agent_definition_id = ad.id
      and td.tool_key = 'investigate_profile'
      and td.version = '1.0'
  );
