import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'format',
  'minimum',
  'maximum',
  'enum',
  'const',
  'default',
  'items',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
])

export type NativePinnedToolContract = {
  tool_definition_id: string
  tool_key: string
  name: string
  description: string
  version: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  execution_config: Record<string, unknown>
  contract_hash: string
}

type NativeToolAdmission = {
  invocationId: string
  contract: NativePinnedToolContract
  toolInput: Record<string, unknown>
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Runtime contract payload cannot contain non-finite numbers')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  throw new Error(`Runtime contract payload contains unsupported value type: ${typeof value}`)
}

export function hashNativeRuntimeValue(value: unknown) {
  const canonical = JSON.stringify(canonicalize(value))
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

export function getNativeRuntimeVersion() {
  const value =
    process.env.DATANEXUS_RUNTIME_VERSION
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.RENDER_GIT_COMMIT
    ?? process.env.GITHUB_SHA
    ?? (process.env.NODE_ENV === 'production' ? null : 'development')
  const version = value?.trim()
  if (!version) throw new Error('Native agent runtime version is unavailable in production')
  if (version.length > 200) throw new Error('Native agent runtime version exceeds 200 characters')
  return version
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function schemaTypeMatches(type: string, value: unknown) {
  switch (type) {
    case 'null': return value === null
    case 'string': return typeof value === 'string'
    case 'boolean': return typeof value === 'boolean'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return typeof value === 'number' && Number.isInteger(value)
    case 'array': return Array.isArray(value)
    case 'object': return isRecord(value)
    default: throw new Error(`Unsupported JSON contract type: ${type}`)
  }
}

function equivalent(left: unknown, right: unknown) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

function assertSupportedSchema(schema: Record<string, unknown>, path: string) {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
      throw new Error(`${path} uses unsupported JSON contract keyword: ${keyword}`)
    }
  }
}

function validateSchemaValue(schemaValue: unknown, value: unknown, path: string): string[] {
  if (!isRecord(schemaValue)) return [`${path}: schema must be an object`]
  const schema = schemaValue
  assertSupportedSchema(schema, path)
  const errors: string[] = []

  const typeSpec = schema.type
  if (typeSpec !== undefined) {
    const types = Array.isArray(typeSpec) ? typeSpec : [typeSpec]
    if (!types.every((item) => typeof item === 'string')) throw new Error(`${path}.type must contain strings`)
    if (!(types as string[]).some((type) => schemaTypeMatches(type, value))) {
      errors.push(`${path}: expected ${types.join('|')}`)
      return errors
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => equivalent(candidate, value))) {
    errors.push(`${path}: value is not in enum`)
  }
  if ('const' in schema && !equivalent(schema.const, value)) errors.push(`${path}: value does not match const`)

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`)
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`)
    if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern).test(value))) errors.push(`${path}: does not match pattern`)
    if (schema.format === 'uuid' && !UUID_PATTERN.test(value)) errors.push(`${path}: invalid uuid`)
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path}: invalid date-time`)
    if (schema.format !== undefined && !['uuid', 'date-time'].includes(String(schema.format))) {
      throw new Error(`${path} uses unsupported JSON contract format: ${String(schema.format)}`)
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: below minimum`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: above maximum`)
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path}: fewer than minItems`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: more than maxItems`)
    if (schema.items !== undefined) {
      value.forEach((item, index) => errors.push(...validateSchemaValue(schema.items, item, `${path}[${index}]`)))
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required) ? schema.required : []
    if (!required.every((item) => typeof item === 'string')) throw new Error(`${path}.required must contain strings`)
    for (const key of required as string[]) {
      if (!(key in value)) errors.push(`${path}.${key}: required property is missing`)
    }
    for (const [key, item] of Object.entries(value)) {
      if (key in properties) {
        errors.push(...validateSchemaValue(properties[key], item, `${path}.${key}`))
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key}: additional property is not allowed`)
      } else if (isRecord(schema.additionalProperties)) {
        errors.push(...validateSchemaValue(schema.additionalProperties, item, `${path}.${key}`))
      }
    }
  }

  return errors
}

export function assertNativeJsonContract(schema: Record<string, unknown>, value: unknown, label: string) {
  const errors = validateSchemaValue(schema, value, '$')
  if (errors.length) throw new Error(`${label} contract violation: ${errors.slice(0, 8).join('; ')}`)
}

function snakeToCamel(value: string) {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * Native execution is stricter than permissive JSON Schema defaults: when a contract
 * declares properties, the executor receives only those properties. This prevents an
 * unregistered caller field from influencing production behavior. Exact names win;
 * snake_case/camelCase aliases are accepted only to bridge existing typed contracts.
 */
export function normalizeNativeToolContractInput(
  contract: NativePinnedToolContract,
  rawInput: Record<string, unknown>,
) {
  const properties = isRecord(contract.input_schema.properties) ? contract.input_schema.properties : null
  if (!properties) {
    assertNativeJsonContract(contract.input_schema, rawInput, `${contract.tool_key} input`)
    return rawInput
  }

  const normalized: Record<string, unknown> = {}
  for (const key of Object.keys(properties)) {
    const candidates = Array.from(new Set([key, snakeToCamel(key), camelToSnake(key)]))
    const match = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(rawInput, candidate))
    if (match) normalized[key] = rawInput[match]
  }
  assertNativeJsonContract(contract.input_schema, normalized, `${contract.tool_key} input`)
  return normalized
}

export async function ensureNativeRuntimeManifest(input: {
  agentRunId: string
  runtimeVersion?: string
}) {
  const runtimeVersion = input.runtimeVersion ?? getNativeRuntimeVersion()
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('ensure_runtime_manifest_internal', {
    p_agent_run_id: input.agentRunId,
    p_runtime_version: runtimeVersion,
  })
  if (error || typeof data !== 'string') {
    throw new Error(`Unable to pin native runtime manifest: ${error?.message ?? 'invalid manifest id'}`)
  }
  return data
}

export async function getNativePinnedToolContract(agentRunId: string, toolKey: string) {
  await ensureNativeRuntimeManifest({ agentRunId })
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_runtime_manifests')
    .select('tool_contracts')
    .eq('agent_run_id', agentRunId)
    .maybeSingle()
  if (error || !data) throw new Error(`Unable to load pinned runtime manifest: ${error?.message ?? 'not found'}`)
  const contracts = isRecord(data.tool_contracts) ? data.tool_contracts : {}
  const contract = contracts[toolKey]
  if (!isRecord(contract)) throw new Error(`Tool ${toolKey} is not pinned to agent run ${agentRunId}`)
  if (!SHA256_PATTERN.test(String(contract.contract_hash ?? ''))) throw new Error(`Pinned tool ${toolKey} has an invalid contract hash`)
  return contract as unknown as NativePinnedToolContract
}

export async function getNativePinnedToolContracts(agentRunId: string, toolKeys: string[]) {
  await ensureNativeRuntimeManifest({ agentRunId })
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_runtime_manifests')
    .select('tool_contracts')
    .eq('agent_run_id', agentRunId)
    .maybeSingle()
  if (error || !data) throw new Error(`Unable to load pinned runtime manifest: ${error?.message ?? 'not found'}`)
  const contracts = isRecord(data.tool_contracts) ? data.tool_contracts : {}
  return new Map(toolKeys.map((toolKey) => {
    const contract = contracts[toolKey]
    if (!isRecord(contract)) throw new Error(`Tool ${toolKey} is not pinned to agent run ${agentRunId}`)
    if (!SHA256_PATTERN.test(String(contract.contract_hash ?? ''))) throw new Error(`Pinned tool ${toolKey} has an invalid contract hash`)
    return [toolKey, contract as unknown as NativePinnedToolContract] as const
  }))
}

export async function admitNativeToolInvocation(input: {
  agentRunId: string
  toolKey: string
  expectedExecutor: string
  toolInput: Record<string, unknown>
  idempotencyKey?: string | null
  approvalInterruptId?: string | null
}): Promise<NativeToolAdmission> {
  const contract = await getNativePinnedToolContract(input.agentRunId, input.toolKey)
  const toolInput = normalizeNativeToolContractInput(contract, input.toolInput)
  const inputHash = hashNativeRuntimeValue(toolInput)

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('admit_tool_invocation_internal', {
    p_agent_run_id: input.agentRunId,
    p_tool_key: input.toolKey,
    p_expected_executor: input.expectedExecutor,
    p_input_hash: inputHash,
    p_idempotency_key: input.idempotencyKey?.trim() || null,
    p_approval_interrupt_id: input.approvalInterruptId ?? null,
  })
  if (error || !isRecord(data)) throw new Error(`Tool ${input.toolKey} admission failed: ${error?.message ?? 'invalid admission result'}`)
  const invocationId = String(data.invocation_id ?? '')
  if (!invocationId) throw new Error(`Tool ${input.toolKey} admission returned no invocation id`)
  if (data.reused === true) {
    throw new Error(`Tool ${input.toolKey} idempotency key was already admitted with status ${String(data.status ?? 'UNKNOWN')}; duplicate execution is blocked`)
  }
  return { invocationId, contract, toolInput }
}

export async function completeNativeToolInvocation(input: {
  invocationId: string
  contract: NativePinnedToolContract
  output: unknown
}) {
  try {
    assertNativeJsonContract(input.contract.output_schema, input.output, `${input.contract.tool_key} output`)
  } catch (error) {
    await failNativeToolInvocation({
      invocationId: input.invocationId,
      errorCode: 'TOOL_OUTPUT_CONTRACT_VIOLATION',
      error,
    })
    throw error
  }

  const admin = createAdminClient()
  const { error } = await admin.schema('agent').rpc('complete_tool_invocation_internal', {
    p_invocation_id: input.invocationId,
    p_status: 'SUCCEEDED',
    p_output_hash: hashNativeRuntimeValue(input.output),
    p_error_code: null,
    p_error_summary: null,
  })
  if (error) throw new Error(`Unable to complete native tool invocation: ${error.message}`)
}

export async function failNativeToolInvocation(input: {
  invocationId: string
  errorCode?: string
  error: unknown
}) {
  const summary = input.error instanceof Error ? input.error.message : String(input.error)
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').rpc('complete_tool_invocation_internal', {
    p_invocation_id: input.invocationId,
    p_status: 'FAILED',
    p_output_hash: null,
    p_error_code: input.errorCode?.trim() || 'TOOL_EXECUTION_FAILED',
    p_error_summary: summary.slice(0, 2000),
  })
  if (error && !/already terminal/i.test(error.message)) {
    throw new Error(`Unable to record native tool invocation failure: ${error.message}`)
  }
}
