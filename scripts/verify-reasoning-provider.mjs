import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')
const investigation = fs.readFileSync('lib/ai/investigation-model.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Reasoning provider contract missing: ${label}`)
}

requireText(provider, 'export interface ReasoningProvider', 'replaceable provider interface')
requireText(provider, "task: ReasoningTask", 'task-aware request')
requireText(provider, "provider: string", 'provider identity in result')
requireText(provider, "model: string", 'model identity in result')
requireText(provider, "AI_REASONING_PROVIDER", 'provider selection boundary')
requireText(provider, "openai_compatible", 'backward-compatible initial provider')
requireText(provider, "response_format: { type: 'json_object' }", 'structured output contract')
requireText(investigation, "getReasoningProvider", 'profiling investigation provider routing')
requireText(investigation, "task: 'profiling_investigation'", 'profiling task classification')

if (investigation.includes('/chat/completions') || investigation.includes('AI_MODEL_API_KEY')) {
  throw new Error('Profiling investigation must not bypass the ReasoningProvider boundary.')
}

console.log('ADR-006 ReasoningProvider contract verified.')
