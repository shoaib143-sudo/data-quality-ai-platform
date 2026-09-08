import assert from 'node:assert/strict'

const { GovernanceModelRegistry } = await import('../lib/ai/model-registry.ts')

const scorecardCalls = []
const registry = new GovernanceModelRegistry({
  listCurrent: async (projectId) => {
    assert.equal(projectId, 'project-a')
    return [
      {
        ai_system_id: 'system-active',
        ai_system_version_id: 'version-active',
        project_id: projectId,
        system_key: 'int-active-model',
        system_name: 'Active model',
        system_type: 'MODEL',
        lifecycle_status: 'ACTIVE',
        version_number: 2,
        provider: ' qwen ',
        model_name: ' qwen-test ',
        external_version: ' 2.0 ',
        intended_use: 'Governed reasoning',
        risk_tier: 'MEDIUM',
        data_categories: ['INTERNAL'],
        human_oversight: 'Human review required',
        configuration: {},
      },
      {
        ai_system_id: 'system-draft',
        ai_system_version_id: 'version-draft',
        project_id: projectId,
        system_key: 'syn-demo-model',
        system_name: 'Draft demo',
        system_type: 'MODEL',
        lifecycle_status: 'DRAFT',
        version_number: 1,
        provider: 'DEMO_PROVIDER',
        model_name: 'demo-model',
        external_version: '1.0',
        intended_use: 'Demo only',
        risk_tier: 'LOW',
        data_categories: ['PUBLIC_DEMO_TEXT'],
        human_oversight: 'Human review required',
        configuration: { demo_only: true, deployment_authority: 'NONE' },
      },
    ]
  },
  evaluationScorecard: async (input) => {
    scorecardCalls.push(input)
    return input.aiSystemVersionId === 'version-active'
      ? [{ evaluationType: 'REASONING', capability: 'governance_summary', metricName: 'grounding', sampleCount: 10, scoredCount: 10, passCount: 9, failCount: 1, averageScore: 0.93 }]
      : [{ evaluationType: 'REASONING', capability: 'governance_summary', metricName: 'grounding', sampleCount: 100, scoredCount: 100, passCount: 100, failCount: 0, averageScore: 1 }]
  },
})

const all = await registry.listCurrent({ projectId: ' project-a ', capability: ' governance_summary ' })
assert.equal(all.length, 2)
assert.equal(all[0].routingEligible, true)
assert.equal(all[0].eligibilityReason, 'ACTIVE_HUMAN_APPROVED_CURRENT_VERSION')
assert.equal(all[0].provider, 'qwen')
assert.equal(all[0].modelName, 'qwen-test')
assert.equal(all[0].evaluationScorecard[0].averageScore, 0.93)
assert.equal(all[1].routingEligible, false)
assert.equal(all[1].eligibilityReason, 'LIFECYCLE_DRAFT')
assert.equal(all[1].evaluationScorecard[0].averageScore, 1)
assert.equal(scorecardCalls.length, 2)
assert.equal(scorecardCalls[0].capability, 'governance_summary')

const eligible = await registry.listCurrent({ projectId: 'project-a', routingEligibleOnly: true })
assert.equal(eligible.length, 1)
assert.equal(eligible[0].aiSystemVersionId, 'version-active')

const missingProvider = new GovernanceModelRegistry({
  listCurrent: async () => [{
    ai_system_id: 'system-active', ai_system_version_id: 'version-active', project_id: 'project-a',
    system_key: 'int-active-model', system_name: 'Active model', system_type: 'MODEL', lifecycle_status: 'ACTIVE',
    version_number: 1, provider: null, model_name: 'model', external_version: null, intended_use: 'test', risk_tier: 'LOW',
    data_categories: [], human_oversight: 'required', configuration: {},
  }],
  evaluationScorecard: async () => [],
})
const providerless = await missingProvider.listCurrent({ projectId: 'project-a' })
assert.equal(providerless[0].routingEligible, false)
assert.equal(providerless[0].eligibilityReason, 'PROVIDER_OR_MODEL_NOT_CONFIGURED')

console.log('ADR-006 ModelRegistry behavior verified.')
