export type ExternalEvidence = Readonly<{
  capability: string
  sourceRevision: string
  observedAt: string
  advisory: true
  authoritative: false
  findings: readonly Readonly<{
    code: string
    summary: string
    severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  }>[]
}>

export function normalizeExternalEvidence(input: {
  capability: string
  sourceRevision: string
  observedAt: string
  findings: Array<{ code: string; summary: string; severity: ExternalEvidence['findings'][number]['severity'] }>
}): ExternalEvidence {
  if (!input.capability.trim()) throw new Error('capability is required')
  if (!/^[a-f0-9]{7,64}$/i.test(input.sourceRevision)) throw new Error('sourceRevision must be a pinned revision')
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('observedAt must be ISO-compatible')
  return {
    capability: input.capability,
    sourceRevision: input.sourceRevision,
    observedAt: input.observedAt,
    advisory: true,
    authoritative: false,
    findings: input.findings.map((finding) => ({
      code: String(finding.code).slice(0, 128),
      summary: String(finding.summary).slice(0, 2000),
      severity: finding.severity,
    })),
  }
}
