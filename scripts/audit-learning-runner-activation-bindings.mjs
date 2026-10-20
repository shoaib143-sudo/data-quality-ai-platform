import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration=fs.readFileSync('supabase/migrations/20261020120000_learning_runner_activation_bindings.sql','utf8')
const artifacts=fs.readFileSync('lib/agents/learning-runner-artifacts.ts','utf8')
const activation=fs.readFileSync('lib/agents/learning-runner-activation.ts','utf8')
const synthetic=fs.readFileSync('lib/agents/learning-runner-synthetic.ts','utf8')
const executable=fs.readFileSync('lib/agents/learning-runner-executable.ts','utf8')
const replay=fs.readFileSync('lib/agents/learning-runner-replay.ts','utf8')

for(const pattern of [
  /learning_artifact_manifests/,
  /learning_evaluation_runtime_bindings/,
  /learning_evaluator_assignments/,
  /before update or delete/,
  /baseline_agent_definition_id <> candidate_agent_definition_id/,
  /Runtime definitions do not match locked policy versions/,
  /Candidate executable does not match candidate agent\/skill\/version/,
  /Candidate baseline\/candidate runtime version mismatch/,
  /Runtime hashes must equal immutable executable artifact digests/,
  /v_base_art\.skill_key<>v_policy\.skill_key/,
  /v_cand_art\.skill_key<>v_policy\.skill_key/,
  /Rollback runtime does not match locked policy rollback reference/,
  /Replay artifact must bind a held-out case/,
  /Replay artifact dataset version must match the sealed manifest/,
  /Independent evaluator separation is required/,
  /assigned_by <> proposer_user_id/,
]) assert.match(migration,pattern)

assert.match(migration,/revoke all on agent\.learning_artifact_manifests from public,anon,authenticated,service_role/)
assert.match(migration,/grant select on agent\.learning_artifact_manifests to service_role/)
assert.match(migration,/grant select on agent\.learning_evaluation_runtime_bindings to service_role/)
assert.match(migration,/grant select on agent\.learning_evaluator_assignments to service_role/)
assert.doesNotMatch(migration,/grant select,insert on agent\.learning_/i)
assert.doesNotMatch(migration,/grant (update|delete).*learning_artifact_manifests.*service_role/i)
assert.doesNotMatch(migration,/PROMOTE_LEARNING_CANDIDATE/)
assert.doesNotMatch(migration,/transition_agent_version_lifecycle/)
assert.doesNotMatch(migration,/update\s+agent\.agent_definitions/i)

assert.match(artifacts,/upsert:false/)
assert.match(artifacts,/LEARNING_ARTIFACT_READBACK_INTEGRITY/)
assert.match(artifacts,/LEARNING_ARTIFACT_BYTES_TAMPERED/)
assert.match(artifacts,/artifact_kind','HELD_OUT_INPUT'/)
assert.doesNotMatch(artifacts,/createSignedUrl/)
assert.doesNotMatch(artifacts,/NEXT_PUBLIC_/)

assert.match(activation,/authorizeProject\(activation\.proposerUserId,plan\.policy\.projectId,'agent\.execute'\)/)
assert.match(activation,/authorizeProject\(activation\.evaluatorUserId,plan\.policy\.projectId,'agent\.learning\.evaluate'\)/)
assert.match(activation,/authorizeProject\(input\.assignedBy,input\.projectId,'agent\.learning\.assign_evaluator'\)/)
assert.match(activation,/authorizeProject\(input\.proposerUserId,input\.projectId,'agent\.execute'\)/)
assert.match(activation,/authorizeProject\(input\.assignedBy,input\.projectId,input\.assignmentCapability\)/)
assert.match(activation,/authorizeProject\(input\.evaluatorUserId,input\.projectId,'agent\.learning\.evaluate'\)/)
assert.match(activation,/LEARNING_EVALUATOR_SCOPE_MISMATCH/)
assert.match(activation,/LEARNING_MANIFEST_BINDING_INVALID/)
assert.match(activation,/resolveHeldOutReplayArtifact/)
assert.doesNotMatch(activation,/PROMOTE_LEARNING_CANDIDATE/)
assert.doesNotMatch(activation,/transitionAgentVersionLifecycle/)

assert.match(synthetic,/provenance!=='synthetic'/)
assert.match(synthetic,/SYNTHETIC_EXECUTOR_PROSPECTIVE_DENIED/)
assert.match(synthetic,/reservationId:null,settlementId:null,costEventId:null,costUsd:'0',tokens:0/)
assert.doesNotMatch(synthetic,/fetch\(|ReasoningProvider|createAdminClient|openai|anthropic/i)

console.log('Independent learning activation audit passed: immutable bindings, private bytes, current authority and $0 synthetic separation are fail-closed')


assert.match(executable,/getNativeRuntimeVersion/)
assert.match(executable,/hashNativeRuntimeValue/)
assert.match(executable,/definitionSnapshot/)
assert.match(executable,/toolContractSetHash/)
assert.match(executable,/policyContractVersion:'agent-policy-v2'/)
assert.match(executable,/stageImmutableLearningArtifact/)
assert.doesNotMatch(executable,/upsert:true/)
assert.doesNotMatch(executable,/createSignedUrl/)

assert.match(replay,/learning_benchmark_dataset_manifests/)
assert.match(replay,/learning_benchmark_dataset_cases/)
assert.match(replay,/caseRow\.split!=='HELD_OUT'/)
assert.match(replay,/manifest\.status!=='SEALED'/)
assert.match(replay,/sourceRef:String\(caseRow\.source_case_ref\)/)
assert.match(replay,/datasetVersionId:String\(manifest\.dataset_version\)/)
assert.doesNotMatch(replay,/createSignedUrl|fetch\(/)


assert.equal(migration.split('create table if not exists agent.learning_artifact_manifests').length - 1,1)
assert.equal(migration.split('create or replace function agent.register_learning_artifact_manifest(').length - 1,1)
assert.equal(migration.split('create or replace function agent.register_learning_runtime_binding(').length - 1,1)
assert.equal(migration.split('create or replace function agent.register_learning_evaluator_assignment(').length - 1,1)
assert.ok(migration.split('\n').length < 700,'activation binding migration unexpectedly expanded or duplicated')
assert.match(artifacts,/p_skill_key:input\.skillKey/)
assert.match(artifacts,/p_runtime_version:input\.runtimeVersion/)
assert.match(artifacts,/p_tool_contract_set_hash:input\.toolContractSetHash/)
assert.match(executable,/runtimeVersion,definitionHash:runtimeEvidence\.definitionHash,toolContractSetHash:runtimeEvidence\.semanticToolContractSetHash/)

assert.match(executable,/format:'reasoning_prompt_v1'/)
assert.match(executable,/skillKey:input\.skillKey/)
assert.match(executable,/version:String\(def\.version\)/)
assert.match(executable,/system:String\(def\.system_prompt\)/)
assert.match(executable,/maxOutputTokens/)
assert.match(executable,/runtimeEvidence/)
assert.match(executable,/toolContractSetHash/)
assert.match(executable,/getGovernedSkill\(input\.skillKey\)\.eligibleAgents/)

for (const required of [
  'learning_artifact_manifests_authenticated_deny',
  'learning_runtime_bindings_authenticated_deny',
  'learning_evaluator_assignments_authenticated_deny',
  'learning_artifact_definition_fk_idx',
  'learning_artifact_candidate_fk_idx',
  'learning_artifact_case_fk_idx',
  'learning_runtime_binding_policy_fk_idx',
  'learning_runtime_binding_candidate_fk_idx',
  'learning_runtime_binding_baseline_definition_fk_idx',
  'learning_runtime_binding_candidate_definition_fk_idx',
  'learning_runtime_binding_rollback_definition_fk_idx',
  'learning_runtime_binding_baseline_artifact_fk_idx',
  'learning_runtime_binding_candidate_artifact_fk_idx',
  'learning_evaluator_policy_fk_idx',
  'learning_evaluator_candidate_fk_idx',
  'learning_evaluator_proposer_fk_idx',
  'learning_evaluator_evaluator_fk_idx',
  'learning_evaluator_assigned_by_fk_idx',
]) assert.match(migration,new RegExp(required))
assert.match(migration,/using \(false\) with check \(false\)/)

assert.match(executable,/semanticToolContracts/)
assert.match(executable,/nativeToolContractSetHash/)
assert.match(executable,/semanticToolContractSetHash/)
assert.match(executable,/toolDefinitionId:_toolDefinitionId,contractHash:_contractHash/)

assert.match(migration,/Learning artifact object key is not content-addressed/)
assert.match(migration,/Learning artifacts must use the governed Supabase object provider/)
assert.match(migration,/Learning artifacts must use canonical JSON content/)
assert.match(migration,/Executable artifact source reference mismatch/)
assert.match(artifacts,/Clean up only resources created by this invocation/)
assert.match(artifacts,/createdNewObject && lifecycle\.created && !lookupError && !registered/)
assert.match(artifacts,/LEARNING_ARTIFACT_CONCURRENT_REGISTRATION_CONFLICT/)

assert.match(migration,/object_artifact_id uuid not null references orchestration\.object_artifacts\(id\)/)
assert.match(migration,/protect_learning_artifact_object_lifecycle/)
assert.match(migration,/Referenced learning artifact lifecycle is immutable/)
assert.match(artifacts,/LEARNING_ARTIFACT_LIFECYCLE_BINDING_INVALID/)
assert.match(artifacts,/LEARNING_ARTIFACT_LIFECYCLE_CONFLICT/)

assert.match(artifacts,/const exact=registered\.object_artifact_id===lifecycle\.row\.id/)
assert.match(artifacts,/if\(exact\) return \{id:String\(registered\.id\)/)
assert.match(artifacts,/createdNewObject && lifecycle\.created && !lookupError && !registered/)
