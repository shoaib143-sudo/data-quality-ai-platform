import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourceRoots = ['app', 'lib', 'services', 'supabase/functions']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.java'])
const allowedReasoningEgress = new Set([
  'lib/ai/reasoning-provider.ts',
])
const allowedReasoningFactory = new Set([
  'lib/ai/reasoning-provider.ts',
  'lib/ai/model-gateway.ts',
  'lib/ai/governance-intelligent-router.ts',
])

function normalized(file) {
  return file.split(path.sep).join('/')
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'target') continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...walk(absolute))
    else if (sourceExtensions.has(path.extname(entry.name))) result.push(absolute)
  }
  return result
}

const files = sourceRoots.flatMap((dir) => walk(path.join(root, dir)))
const failures = []

for (const absolute of files) {
  const relative = normalized(path.relative(root, absolute))
  const text = fs.readFileSync(absolute, 'utf8')

  if (!allowedReasoningEgress.has(relative)) {
    for (const marker of ['/chat/completions', 'AI_MODEL_API_KEY', 'new OpenAICompatibleReasoningProvider']) {
      if (text.includes(marker)) failures.push(`${relative} contains direct reasoning egress marker ${marker}`)
    }
  }

  if (!allowedReasoningFactory.has(relative)) {
    if (/\bcreateReasoningProvider\s*\(/.test(text) || /\bgetReasoningProvider\s*\(/.test(text)) {
      failures.push(`${relative} constructs a raw reasoning provider outside the governed composition boundary`)
    }
    if (/import[\s\S]{0,300}\b(createReasoningProvider|getReasoningProvider)\b[\s\S]{0,300}from\s+['"][^'"]*reasoning-provider['"]/.test(text)) {
      failures.push(`${relative} imports a raw reasoning provider factory outside the governed composition boundary`)
    }
  }
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

const composition = read('lib/ai/governance-intelligent-router.ts')
const validation = read('lib/ai/output-validated-intelligent-router.ts')
const taskContract = read('lib/ai/task-contract.ts')
const semantic = read('lib/governance/semantic-search.ts')
const retrieval = read('lib/ai/retrieval-provider.ts')
const migration = read('supabase/migrations/20260910170000_embedding_space_identity.sql')
const rag = read('lib/ai/rag-generation-evaluation.ts')

const contracts = {
  governedRouterOwnsOutputValidation: composition.includes('new OutputValidatedIntelligentRouter(observable, telemetry)'),
  outputValidationFailsClosed: validation.includes('assertValidReasoningOutput(request.task, result.result)') && validation.includes('throw error'),
  outputValidationDoesNotPersistRawModelOutput: validation.includes('raw_output_persisted: false'),
  profilingTaskHasConcreteContract: ['executive_summary', 'probable_root_causes', 'business_issue', 'business_impact', 'recommendations', 'confidence', 'evidence_gaps']
    .every((key) => taskContract.includes(`'${key}'`)),
  embeddingSpaceRegistryExists: migration.includes('create table if not exists governance.embedding_spaces'),
  embeddingSpaceIdentityIncludesProviderModelRevisionDimensions: ['provider_id', 'model_name', 'model_revision', 'dimensions', 'distance_metric', 'normalization']
    .every((column) => migration.includes(column)),
  embeddingSpaceIsImmutable: migration.includes('Embedding-space identity is immutable') && migration.includes('before update or delete on governance.embedding_spaces'),
  semanticRowsReferenceExactSpace: migration.includes('semantic_embeddings_embedding_space_id_fkey') && migration.includes('embedding_space_id set not null'),
  semanticUniquenessUsesExactSpace: migration.includes('unique (project_id, object_type, object_key, embedding_space_id)'),
  semanticRpcFiltersExactSpace: migration.includes('e.embedding_space_id = p_embedding_space_id'),
  applicationUsesSpaceScopedRpc: semantic.includes("rpc('match_semantic_embeddings_in_space'") && !semantic.includes("rpc('match_semantic_embeddings',"),
  retrievalRequiresSpaceIdentity: retrieval.includes("throw new Error('Semantic retrieval requires an exact embeddingSpaceId')"),
  ragEvaluatesCitationCompleteness: rag.includes('citationCompleteness'),
  ragEvaluatesGrounding: rag.includes('groundedClaimRate'),
  ragEvaluatesAuthority: rag.includes('authorityValidity') && rag.includes('AUTHORITY_RANK'),
  ragEvaluatesTemporalValidity: rag.includes('temporalValidity') && rag.includes('citationEffectiveAt'),
  ragEvaluatesRefusalCorrectness: rag.includes('refusalCorrectness'),
  ragPersistsBenchmarkEvidence: rag.includes('recordRagGenerationEvaluation') && rag.includes("evaluationType: 'RAG_GENERATION_GROUNDING'"),
}

for (const [name, valid] of Object.entries(contracts)) {
  if (!valid) failures.push(`contract failed: ${name}`)
}

if (failures.length) {
  console.error(JSON.stringify({ valid: false, failures, contracts }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  valid: true,
  scannedSourceFiles: files.length,
  directReasoningEgressAllowlist: [...allowedReasoningEgress],
  contracts,
}, null, 2))
