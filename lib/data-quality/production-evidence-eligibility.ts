const EXPLICIT_EXCLUSION_FLAGS = [
  'is_synthetic',
  'synthetic',
  'synthetic_bootstrap',
  'is_test',
  'test',
  'is_demo',
  'demo',
] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasExplicitFlag(record: Record<string, unknown>) {
  for (const key of EXPLICIT_EXCLUSION_FLAGS) {
    if (record[key] === true) return true
  }

  const environment = typeof record.environment === 'string'
    ? record.environment.trim().toUpperCase()
    : ''
  return environment === 'TEST' || environment === 'DEMO' || environment === 'SYNTHETIC'
}

export function isExplicitSyntheticTestOrBootstrapEvidence(value: unknown): boolean {
  const visit = (candidate: unknown, depth: number): boolean => {
    const record = asRecord(candidate)
    if (!record || depth > 3) return false
    if (hasExplicitFlag(record)) return true

    return visit(record.metadata, depth + 1) || visit(record.evidence, depth + 1)
  }

  return visit(value, 0)
}
