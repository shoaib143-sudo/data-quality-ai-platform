import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const contracts = read('lib/agents/runtime/native-tool-contracts.ts')
const profilingExecutor = read('lib/agents/executors/profiling-executor.ts')

requireText(contracts, 'normalizeNativeToolContractInput', 'Native runtime must normalize tool input against the pinned schema.')
requireText(contracts, 'assertNativeJsonContract(contract.input_schema, normalized', 'Normalized tool input must be validated before execution.')
requireText(contracts, "schema.additionalProperties === false", 'Input validation must reject undeclared fields when the schema is closed.')
requireText(contracts, "schema.format === 'uuid'", 'UUID tool inputs must be validated.')
requireText(contracts, "schema.format === 'date-time'", 'Date-time tool inputs must be validated.')
requireText(contracts, 'throw new Error(`${label} contract violation:', 'Contract violations must fail closed.')
requireText(contracts, 'const inputHash = hashNativeRuntimeValue(toolInput)', 'Validated input must be hashed before admission.')
requireText(contracts, "rpc('admit_tool_invocation_internal'", 'Tool execution must pass through server-authoritative admission.')
requireText(contracts, 'assertNativeJsonContract(input.contract.output_schema, input.output', 'Tool output must be validated before successful completion.')
requireText(contracts, "errorCode: 'TOOL_OUTPUT_CONTRACT_VIOLATION'", 'Output contract violations must be recorded explicitly.')
requireText(contracts, "p_status: 'FAILED'", 'Failed tool invocations must be persisted as failed evidence.')
requireText(profilingExecutor, 'admitNativeToolInvocation({', 'Production profiling tools must use native tool admission.')
requireText(profilingExecutor, 'completeNativeToolInvocation({', 'Production profiling tools must validate output before completion.')
requireText(profilingExecutor, 'failNativeToolInvocation({', 'Production profiling tools must record execution failure evidence.')

console.log('Runtime v2 tool input/output contract validation verified.')
