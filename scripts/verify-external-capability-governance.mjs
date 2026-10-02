import fs from 'node:fs'

const policy = fs.readFileSync('lib/agents/external-capability-policy.ts', 'utf8')
const required = [
  "enabledByDefault: false",
  "authoritative: false",
  "productionSecretsAllowed: false",
  "'CAPABILITY_DISABLED_BY_DEFAULT'",
  "'SECRETS_FORBIDDEN'",
  "'HOST_NOT_ALLOWLISTED'",
  "'BENCHMARK_ONLY'",
]
for (const token of required) {
  if (!policy.includes(token)) throw new Error(`external capability governance missing: ${token}`)
}

const agents = fs.readFileSync('AGENTS.md', 'utf8')
for (const boundary of ['authentication and identity', 'canonical evidence and immutable audit history', 'learning-authority boundaries']) {
  if (!agents.includes(boundary)) throw new Error(`DataNexus authority boundary missing: ${boundary}`)
}

console.log('External capability governance verified.')
