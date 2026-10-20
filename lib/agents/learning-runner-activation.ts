import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProject, type AuthorizationCapability } from '@/lib/auth/authorize'
import {
  learningRunnerExecutionManifestHash,
  type LearningExperimentRunnerPlan,
  type RunnerAuthorization,
  type RunnerCase,
} from './learning-experiment-runner'
import { resolveHeldOutReplayArtifact, resolveLearningArtifact } from './learning-runner-artifacts'
import type { LearningEvaluationPolicy } from './learning-evaluation-policy'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA=/^sha256:[a-f0-9]{64}$/
const sha=(value:string)=>`sha256:${createHash('sha256').update(value,'utf8').digest('hex')}`

export type LearningRunnerActivation = {
  runtimeBindingId:string
  evaluatorAssignmentId:string
  baselineAgentDefinitionId:string
  candidateAgentDefinitionId:string
  rollbackAgentDefinitionId:string
  baselineRuntimeHash:string
  candidateRuntimeHash:string
  bindingHash:string
  proposerUserId:string
  evaluatorUserId:string
  evaluatorScopeHash:string
}

export async function loadLearningRunnerActivation(input:{
  projectId:string;policyRecordId:string;candidateId:string
}):Promise<LearningRunnerActivation>{
  const admin=createAdminClient()
  const [{data:binding,error:bindingError},{data:assignment,error:assignmentError}]=await Promise.all([
    admin.schema('agent').from('learning_evaluation_runtime_bindings')
      .select('id,project_id,policy_id,candidate_id,baseline_agent_definition_id,candidate_agent_definition_id,rollback_agent_definition_id,baseline_artifact_id,candidate_artifact_id,baseline_runtime_hash,candidate_runtime_hash,binding_hash')
      .eq('project_id',input.projectId).eq('policy_id',input.policyRecordId).eq('candidate_id',input.candidateId).maybeSingle(),
    admin.schema('agent').from('learning_evaluator_assignments')
      .select('id,project_id,policy_id,candidate_id,proposer_user_id,evaluator_user_id,scope_hash,acknowledged_at')
      .eq('project_id',input.projectId).eq('policy_id',input.policyRecordId).eq('candidate_id',input.candidateId).maybeSingle(),
  ])
  if(bindingError) throw new Error(`LEARNING_RUNTIME_BINDING_LOOKUP_FAILED: ${bindingError.message}`)
  if(assignmentError) throw new Error(`LEARNING_EVALUATOR_ASSIGNMENT_LOOKUP_FAILED: ${assignmentError.message}`)
  if(!binding) throw new Error('LEARNING_RUNTIME_BINDING_MISSING')
  if(!assignment) throw new Error('LEARNING_EVALUATOR_ASSIGNMENT_MISSING')
  for(const value of [binding.id,binding.baseline_agent_definition_id,binding.candidate_agent_definition_id,binding.rollback_agent_definition_id,assignment.id,assignment.proposer_user_id,assignment.evaluator_user_id]) {
    if(!UUID.test(String(value))) throw new Error('LEARNING_ACTIVATION_IDENTITY_INVALID')
  }
  for(const value of [binding.baseline_runtime_hash,binding.candidate_runtime_hash,binding.binding_hash,assignment.scope_hash]) {
    if(!SHA.test(String(value))) throw new Error('LEARNING_ACTIVATION_HASH_INVALID')
  }
  if(assignment.proposer_user_id===assignment.evaluator_user_id) throw new Error('LEARNING_EVALUATOR_NOT_INDEPENDENT')
  return {
    runtimeBindingId:String(binding.id),evaluatorAssignmentId:String(assignment.id),
    baselineAgentDefinitionId:String(binding.baseline_agent_definition_id),
    candidateAgentDefinitionId:String(binding.candidate_agent_definition_id),
    rollbackAgentDefinitionId:String(binding.rollback_agent_definition_id),
    baselineRuntimeHash:String(binding.baseline_runtime_hash),candidateRuntimeHash:String(binding.candidate_runtime_hash),
    bindingHash:String(binding.binding_hash),proposerUserId:String(assignment.proposer_user_id),
    evaluatorUserId:String(assignment.evaluator_user_id),evaluatorScopeHash:String(assignment.scope_hash),
  }
}

function policyFromRow(row:Record<string,unknown>):LearningEvaluationPolicy {
  return {
    policyId:String(row.policy_key),projectId:String(row.project_id),candidateId:String(row.candidate_id),
    agentKey:row.agent_key as LearningEvaluationPolicy['agentKey'],skillKey:row.skill_key as LearningEvaluationPolicy['skillKey'],
    mode:row.mode as LearningEvaluationPolicy['mode'],datasetVersionIds:row.dataset_version_ids as string[],
    datasetManifestId:String(row.dataset_manifest_id),baselineVersion:String(row.baseline_version),candidateVersion:String(row.candidate_version),
    rollbackRef:String(row.rollback_ref),evaluatorActorId:String(row.evaluator_actor_id),proposerActorId:String(row.proposer_actor_id),
    rubricRef:String(row.rubric_ref),calibrationRef:String(row.calibration_ref),manifestHash:String(row.manifest_hash),lockedAt:String(row.locked_at),
    primaryMetric:String(row.primary_metric),analysisPlanRef:String(row.analysis_plan_ref),sampleSize:Number(row.sample_size),
    minimumGain:Number(row.minimum_gain),minimumScore:Number(row.minimum_score),
    budget:{totalCost:Number(row.total_cost_budget),perRunCost:Number(row.per_run_cost_budget),totalTokens:Number(row.total_token_budget),
      perRunTokens:Number(row.per_run_token_budget),latencyMs:Number(row.latency_ms_budget)},
  }
}

export async function buildCanonicalLearningRunnerPlan(input:{
  runId:string;projectId:string;policyRecordId:string;candidateId:string;provenance:'synthetic'|'prospective'
}):Promise<LearningExperimentRunnerPlan>{
  if(!UUID.test(input.runId)||!UUID.test(input.projectId)||!UUID.test(input.policyRecordId)||!UUID.test(input.candidateId)) throw new Error('LEARNING_PLAN_SCOPE_INVALID')
  const admin=createAdminClient()
  const {data:policyRow,error:policyError}=await admin.schema('agent').from('learning_evaluation_policies')
    .select('*').eq('id',input.policyRecordId).eq('project_id',input.projectId).eq('candidate_id',input.candidateId).maybeSingle()
  if(policyError) throw new Error(`LEARNING_POLICY_LOOKUP_FAILED: ${policyError.message}`)
  if(!policyRow) throw new Error('LEARNING_POLICY_MISSING')
  const policy=policyFromRow(policyRow as Record<string,unknown>)
  const activation=await loadLearningRunnerActivation(input)

  const {data:binding,error:bindingError}=await admin.schema('agent').from('learning_evaluation_runtime_bindings')
    .select('baseline_artifact_id,candidate_artifact_id').eq('id',activation.runtimeBindingId).maybeSingle()
  if(bindingError||!binding) throw new Error('LEARNING_RUNTIME_ARTIFACT_BINDING_MISSING')

  const [baseline,candidate]=await Promise.all([
    resolveLearningArtifact({projectId:input.projectId,artifactId:String(binding.baseline_artifact_id),expectedKind:'EXECUTABLE',expectedRole:'BASELINE',expectedAgentDefinitionId:activation.baselineAgentDefinitionId}),
    resolveLearningArtifact({projectId:input.projectId,artifactId:String(binding.candidate_artifact_id),expectedKind:'EXECUTABLE',expectedRole:'CANDIDATE',expectedAgentDefinitionId:activation.candidateAgentDefinitionId,expectedCandidateId:input.candidateId}),
  ])

  const [{data:manifest,error:manifestError},{data:caseRows,error:caseError}]=await Promise.all([
    admin.schema('agent').from('learning_benchmark_dataset_manifests')
      .select('id,project_id,dataset_version,status,manifest_hash')
      .eq('id',policy.datasetManifestId).eq('project_id',input.projectId).maybeSingle(),
    admin.schema('agent').from('learning_benchmark_dataset_cases')
      .select('case_key,split,source_case_ref')
      .eq('project_id',input.projectId).eq('dataset_id',policy.datasetManifestId).order('case_key',{ascending:true}),
  ])
  if(manifestError||!manifest) throw new Error('LEARNING_MANIFEST_LOOKUP_FAILED')
  if(manifest.status!=='SEALED'||manifest.manifest_hash!==policy.manifestHash||!policy.datasetVersionIds.includes(String(manifest.dataset_version))) {
    throw new Error('LEARNING_MANIFEST_BINDING_INVALID')
  }
  if(caseError) throw new Error(`LEARNING_CASE_LOOKUP_FAILED: ${caseError.message}`)
  const held=(caseRows??[]).filter(r=>r.split==='HELD_OUT')
  const training=(caseRows??[]).filter(r=>r.split==='TRAINING').map(r=>String(r.case_key))
  if(held.length!==policy.sampleSize) throw new Error('LEARNING_HELD_OUT_SAMPLE_MISMATCH')

  const cases:RunnerCase[]=[]
  for(const row of held){
    const datasetVersionId=String(manifest.dataset_version)
    cases.push({
      caseKey:String(row.case_key),datasetVersionId,split:'held_out',
      input:await resolveHeldOutReplayArtifact({projectId:input.projectId,datasetManifestId:policy.datasetManifestId,caseKey:String(row.case_key),datasetVersionId}),
    })
  }

  const unsigned={
    runId:input.runId,policyRecordId:input.policyRecordId,provenance:input.provenance,policy,
    baseline,candidate,cases,trainingCaseKeys:training,
  }
  return {...unsigned,executionManifestHash:learningRunnerExecutionManifestHash(unsigned)}
}


export async function registerLearningRuntimeBinding(input:{
  projectId:string;policyRecordId:string;candidateId:string
  baselineAgentDefinitionId:string;candidateAgentDefinitionId:string;rollbackAgentDefinitionId:string
  baselineArtifactId:string;candidateArtifactId:string
  baselineRuntimeHash:string;candidateRuntimeHash:string
}){
  const values=[
    input.projectId,input.policyRecordId,input.candidateId,
    input.baselineAgentDefinitionId,input.candidateAgentDefinitionId,input.rollbackAgentDefinitionId,
    input.baselineArtifactId,input.candidateArtifactId,input.baselineRuntimeHash,input.candidateRuntimeHash,
  ]
  if(values.slice(0,8).some(value=>!UUID.test(value))||values.slice(8).some(value=>!SHA.test(value))) {
    throw new Error('LEARNING_RUNTIME_BINDING_INPUT_INVALID')
  }
  const bindingHash=sha(values.join('|'))
  const admin=createAdminClient()
  const {data,error}=await admin.schema('agent').rpc('register_learning_runtime_binding',{
    p_project_id:input.projectId,p_policy_id:input.policyRecordId,p_candidate_id:input.candidateId,
    p_baseline_agent_definition_id:input.baselineAgentDefinitionId,p_candidate_agent_definition_id:input.candidateAgentDefinitionId,
    p_rollback_agent_definition_id:input.rollbackAgentDefinitionId,p_baseline_artifact_id:input.baselineArtifactId,
    p_candidate_artifact_id:input.candidateArtifactId,p_baseline_runtime_hash:input.baselineRuntimeHash,
    p_candidate_runtime_hash:input.candidateRuntimeHash,p_binding_hash:bindingHash,
  })
  if(error||!data) throw new Error(`LEARNING_RUNTIME_BINDING_REGISTRATION_FAILED: ${error?.message ?? 'missing id'}`)
  return {id:String(data),bindingHash}
}

export async function registerLearningEvaluatorAssignment(input:{
  projectId:string;policyRecordId:string;candidateId:string
  proposerUserId:string;evaluatorUserId:string;assignedBy:string;acknowledgedAt:string
  assignmentCapability:AuthorizationCapability
}){
  for(const value of [input.projectId,input.policyRecordId,input.candidateId,input.proposerUserId,input.evaluatorUserId,input.assignedBy]) {
    if(!UUID.test(value)) throw new Error('LEARNING_EVALUATOR_ASSIGNMENT_IDENTITY_INVALID')
  }
  if(input.proposerUserId===input.evaluatorUserId||input.assignedBy===input.evaluatorUserId) {
    throw new Error('LEARNING_EVALUATOR_NOT_INDEPENDENT')
  }
  if(!Number.isFinite(Date.parse(input.acknowledgedAt))) throw new Error('LEARNING_EVALUATOR_ACK_INVALID')
  const admin=createAdminClient()
  const {data:policy,error:policyError}=await admin.schema('agent').from('learning_evaluation_policies')
    .select('id,project_id,candidate_id,proposer_actor_id,evaluator_actor_id,manifest_hash,rubric_ref,calibration_ref,locked_at')
    .eq('id',input.policyRecordId).eq('project_id',input.projectId).eq('candidate_id',input.candidateId).maybeSingle()
  if(policyError||!policy) throw new Error('LEARNING_EVALUATOR_POLICY_MISSING')
  if(policy.proposer_actor_id!==input.proposerUserId||policy.evaluator_actor_id!==input.evaluatorUserId) {
    throw new Error('LEARNING_EVALUATOR_POLICY_IDENTITY_MISMATCH')
  }
  if(Date.parse(input.acknowledgedAt)<Date.parse(policy.locked_at)) throw new Error('LEARNING_EVALUATOR_ACK_PREDATES_POLICY')
  await Promise.all([
    authorizeProject(input.proposerUserId,input.projectId,'agent.execute'),
    authorizeProject(input.assignedBy,input.projectId,input.assignmentCapability),
    authorizeProject(input.evaluatorUserId,input.projectId,'agent.learning.evaluate'),
  ])
  const scopeHash=sha([
    input.projectId,input.policyRecordId,input.candidateId,input.proposerUserId,input.evaluatorUserId,
    String(policy.manifest_hash),String(policy.rubric_ref),String(policy.calibration_ref),
  ].join('|'))
  const {data,error}=await admin.schema('agent').rpc('register_learning_evaluator_assignment',{
    p_project_id:input.projectId,p_policy_id:input.policyRecordId,p_candidate_id:input.candidateId,
    p_proposer_user_id:input.proposerUserId,p_evaluator_user_id:input.evaluatorUserId,p_assigned_by:input.assignedBy,
    p_scope_hash:scopeHash,p_acknowledged_at:input.acknowledgedAt,
  })
  if(error||!data) throw new Error(`LEARNING_EVALUATOR_ASSIGNMENT_REGISTRATION_FAILED: ${error?.message ?? 'missing id'}`)
  return {id:String(data),scopeHash}
}

export function createLearningRunnerAuthorizationResolver(){
  return async (plan:Readonly<LearningExperimentRunnerPlan>):Promise<RunnerAuthorization>=>{
    const activation=await loadLearningRunnerActivation({
      projectId:plan.policy.projectId,policyRecordId:plan.policyRecordId,candidateId:plan.policy.candidateId,
    })
    if(plan.policy.proposerActorId!==activation.proposerUserId || plan.policy.evaluatorActorId!==activation.evaluatorUserId) {
      throw new Error('LEARNING_ACTOR_BINDING_MISMATCH')
    }
    const expectedScope=sha([
      plan.policy.projectId,plan.policyRecordId,plan.policy.candidateId,activation.proposerUserId,activation.evaluatorUserId,
      plan.policy.manifestHash,plan.policy.rubricRef,plan.policy.calibrationRef,
    ].join('|'))
    if(expectedScope!==activation.evaluatorScopeHash) throw new Error('LEARNING_EVALUATOR_SCOPE_MISMATCH')
    await Promise.all([
      authorizeProject(activation.proposerUserId,plan.policy.projectId,'agent.execute'),
      authorizeProject(activation.evaluatorUserId,plan.policy.projectId,'agent.learning.evaluate'),
    ])
    return {
      projectId:plan.policy.projectId,policyId:plan.policy.policyId,
      proposerActorId:activation.proposerUserId,evaluatorActorId:activation.evaluatorUserId,
      executeAllowed:true,evaluatorAllowed:true,independenceVerified:true,sourceRemediationAllowed:false,
    }
  }
}
