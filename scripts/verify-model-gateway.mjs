import fs from 'node:fs'

const gateway = fs.readFileSync('lib/ai/model-gateway.ts', 'utf8')
const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')
const investigation = fs.readFileSync('lib/ai/investigation-model.ts', 'utf8')
const router = fs.readFileSync('lib/ai/intelligent-router.ts', 'utf8')
const composition = fs.readFileSync('lib/ai/governance-intelligent-router.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Model Gateway contract missing: ${label}`)
}

requireText(gateway, 'export interface ModelGateway', 'stable model gateway interface')
requireText(gateway, 'ReasoningRouteContext', 'task-aware routing context')
requireText(gateway, "export type ModelSensitivity = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'", 'sensitivity routing context')
requireText(gateway, "export type ModelRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'", 'risk routing context')
requireText(gateway, 'AI_REASONING_PROVIDER_${suffix}', 'task-specific provider override')
requireText(gateway, 'AI_MODEL_NAME_${suffix}', 'task-specific model override')
requireText(gateway, 'createReasoningProvider({ providerId, model })', 'provider factory delegation')
requireText(provider, 'ReasoningProviderSelection', 'provider selection contract')
requireText(provider, 'selection.providerId ?? process.env.AI_REASONING_PROVIDER', 'global provider fallback')
requireText(provider, "selection.model?.trim() || process.env.AI_MODEL_NAME?.trim() || 'gpt-4.1-mini'", 'global model fallback')
requireText(router, 'fallbackGateway: ModelGateway', 'Intelligent Router owns environment gateway fallback')
requireText(router, 'this.dependencies.fallbackGateway.reasoning(context)', 'environment fallback delegates through Model Gateway')
requireText(composition, 'fallbackGateway: new EnvironmentModelGateway()', 'governed router composes the Model Gateway fallback')
requireText(investigation, 'createGovernanceIntelligentRouter().route({', 'profiling investigation routes through governed Intelligent Router')
requireText(investigation, "task: 'profiling_investigation'", 'profiling investigation preserves task-aware routing')

if (investigation.includes('getModelGateway') || investigation.includes("from './model-gateway'")) {
  throw new Error('Application reasoning callsites must not bypass the governed Intelligent Router through Model Gateway.')
}
if (investigation.includes('/chat/completions') || investigation.includes('AI_MODEL_API_KEY')) {
  throw new Error('Application reasoning callsites must not bypass the governed model boundary.')
}

console.log('ADR-006 Model Gateway fallback and Intelligent Router integration verified.')
