import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNativeRuntimeVersion, hashNativeRuntimeValue } from '@/lib/agents/runtime/native-tool-contracts'
import { getGovernedSkill, type GovernedSkillKey } from '@/lib/agents/governed-skill-registry'
import { stageImmutableLearningArtifact } from './learning-runner-artifacts'
import { canonicalLearningJsonBytes } from './learning-runner-canonical'

function taskForSkill(skillKey: GovernedSkillKey) {
  if (['profile_evidence_analysis','profile_gap_detection'].includes(skillKey)) return 'profiling_investigation' as const
  if (['incident_root_cause_analysis','support_case_investigation'].includes(skillKey)) return 'incident_investigation' as const
  if ([
    'quality_rule_analysis','quality_remediation_proposal','stewardship_gap_analysis',
    'governance_evidence_synthesis','lineage_impact_analysis','executive_materiality_analysis',
  ].includes(skillKey)) return 'governance_reasoning' as const
  return 'general' as const
}

export async function buildCanonicalLearningExecutable(input:{
  projectId:string
  agentDefinitionId:string
  skillKey:GovernedSkillKey
  role:'BASELINE'|'CANDIDATE'
  candidateId?:string|null
  createdBy?:string|null
  runtimeVersion?:string
  maxOutputTokens?:number
  temperature?:number|null
}){
  const admin=createAdminClient()
  const [{data:def,error:defError},{data:lifecycle,error:lifecycleError},{data:tools,error:toolsError}]=await Promise.all([
    admin.schema('agent').from('agent_definitions')
      .select('id,agent_key,name,description,version,system_prompt,configuration')
      .eq('id',input.agentDefinitionId).maybeSingle(),
    admin.schema('agent').from('agent_version_lifecycle')
      .select('agent_definition_id,agent_key,version,lifecycle_state')
      .eq('agent_definition_id',input.agentDefinitionId).maybeSingle(),
    admin.schema('agent').from('tool_definitions')
      .select('id,agent_definition_id,tool_key,name,description,version,input_schema,output_schema,execution_config,enabled')
      .eq('agent_definition_id',input.agentDefinitionId).eq('enabled',true).order('tool_key',{ascending:true}),
  ])
  if(defError||!def) throw new Error('LEARNING_EXECUTABLE_DEFINITION_MISSING')
  if(lifecycleError||!lifecycle) throw new Error('LEARNING_EXECUTABLE_LIFECYCLE_MISSING')
  if(toolsError) throw new Error(`LEARNING_EXECUTABLE_TOOLS_FAILED: ${toolsError.message}`)
  if(def.agent_key!==lifecycle.agent_key||def.version!==lifecycle.version) throw new Error('LEARNING_EXECUTABLE_DEFINITION_LIFECYCLE_MISMATCH')
  if(!getGovernedSkill(input.skillKey).eligibleAgents.includes(def.agent_key)) throw new Error('LEARNING_EXECUTABLE_SKILL_SCOPE_INVALID')

  if(input.role==='CANDIDATE'){
    if(!input.candidateId) throw new Error('LEARNING_EXECUTABLE_CANDIDATE_REQUIRED')
    if(!['VALIDATED','CANDIDATE'].includes(String(lifecycle.lifecycle_state))) throw new Error('LEARNING_EXECUTABLE_CANDIDATE_STATE_INVALID')
  } else if(!['ACTIVE','DEPRECATED'].includes(String(lifecycle.lifecycle_state))) {
    throw new Error('LEARNING_EXECUTABLE_BASELINE_STATE_INVALID')
  }

  const maxOutputTokens=input.maxOutputTokens??512
  if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>4096) throw new Error('LEARNING_EXECUTABLE_OUTPUT_LIMIT_INVALID')
  const temperature=input.temperature??0
  if(!Number.isFinite(temperature)||temperature<0||temperature>2) throw new Error('LEARNING_EXECUTABLE_TEMPERATURE_INVALID')

  const definitionSnapshot={
    id:String(def.id),agentKey:String(def.agent_key),name:String(def.name),description:def.description??null,
    version:String(def.version),systemPrompt:String(def.system_prompt),configuration:def.configuration,
  }
  const pinnedTools=(tools??[]).map(tool=>({
    toolDefinitionId:String(tool.id),toolKey:String(tool.tool_key),name:String(tool.name),description:tool.description??null,
    version:String(tool.version),inputSchema:tool.input_schema,outputSchema:tool.output_schema,executionConfig:tool.execution_config,
    contractHash:hashNativeRuntimeValue({
      toolDefinitionId:String(tool.id),toolKey:String(tool.tool_key),name:String(tool.name),description:tool.description??null,
      version:String(tool.version),inputSchema:tool.input_schema,outputSchema:tool.output_schema,executionConfig:tool.execution_config,
    }),
  }))
  const semanticToolContracts=pinnedTools.map(({toolDefinitionId:_toolDefinitionId,contractHash:_contractHash,...contract})=>contract)
  const runtimeVersion=input.runtimeVersion?.trim()||getNativeRuntimeVersion()
  const runtimeEvidence={
    schemaVersion:'learning-executable-v1',
    runtimeVersion,
    agentDefinitionId:String(def.id),
    lifecycleState:String(lifecycle.lifecycle_state),
    definitionSnapshot,
    definitionHash:hashNativeRuntimeValue(definitionSnapshot),
    toolContracts:pinnedTools,
    nativeToolContractSetHash:hashNativeRuntimeValue(pinnedTools),
    semanticToolContractSetHash:hashNativeRuntimeValue(semanticToolContracts),
    policyContractVersion:'agent-policy-v2',
  }
  const bundle={
    format:'reasoning_prompt_v1',
    agentKey:String(def.agent_key),
    skillKey:input.skillKey,
    version:String(def.version),
    task:taskForSkill(input.skillKey),
    system:String(def.system_prompt),
    maxOutputTokens,
    temperature,
    runtimeEvidence,
  }
  const bytes=canonicalLearningJsonBytes(bundle)
  const staged=await stageImmutableLearningArtifact({
    projectId:input.projectId,kind:'EXECUTABLE',role:input.role,bytes,
    contentType:'application/json',serializationVersion:'learning-executable-v1',
    runtimeVersion,definitionHash:runtimeEvidence.definitionHash,toolContractSetHash:runtimeEvidence.semanticToolContractSetHash,
    sourceRef:`agent-definition:${input.agentDefinitionId}`,createdBy:input.createdBy??null,
    agentDefinitionId:input.agentDefinitionId,skillKey:input.skillKey,candidateId:input.role==='CANDIDATE'?input.candidateId??null:null,
  })
  return {...staged,runtimeHash:staged.sha256,bundle}
}
