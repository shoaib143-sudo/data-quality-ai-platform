import fs from 'node:fs'

const gateway = fs.readFileSync('lib/ai/model-gateway.ts', 'utf8')
const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')
const investigation = fs.readFileSync('lib/ai/investigation-model.ts', 'utf8')

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
requireText(investigation, "getModelGateway().reasoning({ task: 'profiling_investigation' })", 'profiling investigation gateway routing')

if (investigation.includes('/chat/completions') || investigation.includes('AI_MODEL_API_KEY')) {
  throw new Error('Application reasoning callsites must not bypass the Model Gateway.')
}

console.log('ADR-006 Model Gateway contract verified.')
