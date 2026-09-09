import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')
const investigation = fs.readFileSync('lib/ai/investigation-model.ts', 'utf8')
const investigationEngine = fs.readFileSync('lib/profiling/investigation-engine.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`ReasoningProvider contract missing: ${label}`)
}

requireText(provider, 'export interface ReasoningProvider', 'replaceable reasoning provider interface')
requireText(provider, 'generateJson(request: ReasoningRequest)', 'canonical structured reasoning operation')
requireText(provider, 'maxOutputTokens?: number', 'optional caller-owned output ceiling')
requireText(provider, 'maxOutputTokens must be a positive integer', 'output ceiling validation')
requireText(provider, "{ max_tokens: maxOutputTokens }", 'provider-side OpenAI-compatible output ceiling')
requireText(provider, 'This is not a budget-policy decision by itself', 'budget authority boundary')
requireText(provider, 'export class ReasoningProviderHttpError extends Error', 'typed sanitized provider HTTP failure')
requireText(provider, 'AI reasoning provider returned ${status}', 'status-only provider failure evidence')
requireText(provider, "this.name = 'ReasoningProviderHttpError'", 'stable sanitized provider error identity')
requireText(provider, 'this.status = status', 'sanitized provider HTTP status')
requireText(provider, 'this.providerRequestId = providerRequestId', 'bounded provider request correlation field')
requireText(provider, 'new ReasoningProviderHttpError(response.status, observedRequestId(response))', 'sanitized provider error construction')
requireText(provider, 'observedRequestId(response)', 'bounded provider request correlation')
requireText(provider, 'export function createReasoningProvider', 'gateway-callable provider factory')
requireText(provider, "readonly id = 'openai_compatible'", 'OpenAI-compatible adapter identity')
requireText(provider, "process.env.AI_REASONING_PROVIDER ?? 'openai_compatible'", 'global provider fallback configuration')
requireText(provider, 'Unsupported AI reasoning provider', 'fail-closed provider selection')
requireText(provider, "process.env.AI_MODEL_API_KEY?.trim()", 'existing credential configuration compatibility')
requireText(provider, "process.env.AI_MODEL_BASE_URL ?? 'https://api.openai.com/v1'", 'existing endpoint configuration compatibility')
requireText(provider, "process.env.AI_MODEL_NAME?.trim() || 'gpt-4.1-mini'", 'existing model configuration compatibility')
requireText(provider, "response_format: { type: 'json_object' }", 'structured JSON response contract')
requireText(investigation, "import { createGovernanceIntelligentRouter } from './governance-intelligent-router'", 'profiling investigation uses governed Intelligent Router')
requireText(investigation, 'createGovernanceIntelligentRouter().route({', 'profiling investigation routes through governed router')
requireText(investigation, "task: 'profiling_investigation'", 'profiling task-aware routing')
requireText(investigation, "from('dataset_versions')", 'profiling router resolves persisted dataset version identity')
requireText(investigation, "from('datasets')", 'profiling router resolves persisted project identity')
requireText(investigation, 'if (!projectId) return null', 'missing project identity fails closed to deterministic-only investigation')
requireText(investigation, 'if (!decision.provider) return null', 'unavailable route preserves deterministic-only investigation')
requireText(investigationEngine, 'enrichInvestigationWithModel({', 'active profiling investigation calls governed model enrichment boundary')

if (provider.includes('response.text()')) {
  throw new Error('ReasoningProvider must not surface raw upstream provider error bodies.')
}
if (/AI reasoning provider returned .*text/.test(provider)) {
  throw new Error('ReasoningProvider failure messages must not concatenate upstream response text.')
}
if (investigation.includes('getModelGateway') || investigation.includes("from './model-gateway'")) {
  throw new Error('Profiling investigation must not bypass the governed Intelligent Router through ModelGateway.')
}
if (investigation.includes('/chat/completions') || investigation.includes('AI_MODEL_API_KEY')) {
  throw new Error('Profiling investigation must not bypass the governed model boundary.')
}
if (/maxOutputTokens\s*:\s*\d+/.test(investigation)) {
  throw new Error('Profiling investigation must not invent a fixed output budget without canonical policy evidence.')
}

console.log('ADR-006 ReasoningProvider output cap, typed provider error redaction, and profiling Intelligent Router boundary verified.')
