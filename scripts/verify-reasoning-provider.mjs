import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')
const investigation = fs.readFileSync('lib/ai/investigation-model.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`ReasoningProvider contract missing: ${label}`)
}

requireText(provider, 'export interface ReasoningProvider', 'replaceable reasoning provider interface')
requireText(provider, 'generateJson(request: ReasoningRequest)', 'canonical structured reasoning operation')
requireText(provider, "readonly id = 'openai_compatible'", 'OpenAI-compatible adapter identity')
requireText(provider, "process.env.AI_REASONING_PROVIDER ?? 'openai_compatible'", 'provider routing configuration')
requireText(provider, 'Unsupported AI reasoning provider', 'fail-closed provider selection')
requireText(provider, "process.env.AI_MODEL_API_KEY?.trim()", 'existing credential configuration compatibility')
requireText(provider, "process.env.AI_MODEL_BASE_URL ?? 'https://api.openai.com/v1'", 'existing endpoint configuration compatibility')
requireText(provider, "process.env.AI_MODEL_NAME?.trim() || 'gpt-4.1-mini'", 'existing model configuration compatibility')
requireText(provider, "response_format: { type: 'json_object' }", 'structured JSON response contract')
requireText(investigation, "import { getReasoningProvider } from './reasoning-provider'", 'profiling investigation uses provider boundary')
requireText(investigation, "task: 'profiling_investigation'", 'profiling task classification')
requireText(investigation, 'if (!provider) return null', 'no-provider backward compatibility')

if (investigation.includes('/chat/completions') || investigation.includes('AI_MODEL_API_KEY')) {
  throw new Error('Profiling investigation must not bypass the ReasoningProvider boundary.')
}

console.log('ADR-006 ReasoningProvider boundary verified.')
