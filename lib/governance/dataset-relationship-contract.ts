export type DatasetRelationshipClass =
  | 'SOURCE_AUTHORITATIVE_RELATIONSHIP'
  | 'GOVERNED_RELATIONSHIP'
  | 'OBSERVED_CORRELATION'
  | 'CONTEXT_ONLY'

export type DatasetRelationshipAuthority =
  | 'SOURCE_AUTHORITATIVE_LINEAGE'
  | 'APPROVED_CDE_MAPPING'
  | 'GOVERNED_STEWARDSHIP'
  | 'OBSERVED_INCIDENT_CORRELATION'
  | 'GOVERNED_CATALOG_CONTEXT'

export type DatasetIdentity = {
  id: string
  name: string
  businessDomain?: string | null
}

export type DatasetCdeSignal = {
  targetDatasetId: string
  cdeId: string
  cdeKey: string
  cdeName: string
  criticality: string
  sourceMappingStatus: string
  targetMappingStatus: string
  sourceConfidence?: number | null
  targetConfidence?: number | null
}

export type DatasetStewardshipSignal = {
  targetDatasetId: string
  assignmentId: string
  principalUserId: string
  role: string
  status: string
  active: boolean
  targetState: string
  subjectState: string
}

export type DatasetIncidentCorrelationSignal = {
  targetDatasetId: string
  correlationId: string
  correlationType: string
  status: string
  score: number
  confidence: number
}

export type DatasetLineageSignal = {
  targetDatasetId: string
  edgeId: string
  relationship: string
  authorityState: string
  origin: string
  direction: 'UPSTREAM' | 'DOWNSTREAM'
}

export type DatasetRelationshipSignal = {
  authority: DatasetRelationshipAuthority
  signalType: string
  confidence: number | null
  evidence: Record<string, unknown>
}

export type DatasetRelationship = {
  datasetId: string
  datasetName: string
  businessDomain: string | null
  relationshipClass: DatasetRelationshipClass
  signals: DatasetRelationshipSignal[]
  evidenceCount: number
  maxConfidence: number | null
}

const CLASS_PRIORITY: Record<DatasetRelationshipClass, number> = {
  SOURCE_AUTHORITATIVE_RELATIONSHIP: 4,
  GOVERNED_RELATIONSHIP: 3,
  OBSERVED_CORRELATION: 2,
  CONTEXT_ONLY: 1,
}

function finiteConfidence(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(1, numeric))
}

function normalizedDomain(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized.toLocaleLowerCase() : null
}

function pushSignal(
  bucket: Map<string, DatasetRelationshipSignal[]>,
  targetDatasetId: string,
  signal: DatasetRelationshipSignal,
) {
  if (!targetDatasetId) return
  const signals = bucket.get(targetDatasetId) ?? []
  signals.push(signal)
  bucket.set(targetDatasetId, signals)
}

function classForSignals(signals: DatasetRelationshipSignal[]): DatasetRelationshipClass {
  if (signals.some((signal) => signal.authority === 'SOURCE_AUTHORITATIVE_LINEAGE')) {
    return 'SOURCE_AUTHORITATIVE_RELATIONSHIP'
  }
  if (signals.some((signal) =>
    signal.authority === 'APPROVED_CDE_MAPPING'
    || signal.authority === 'GOVERNED_STEWARDSHIP'
  )) {
    return 'GOVERNED_RELATIONSHIP'
  }
  if (signals.some((signal) => signal.authority === 'OBSERVED_INCIDENT_CORRELATION')) {
    return 'OBSERVED_CORRELATION'
  }
  return 'CONTEXT_ONLY'
}

export function buildDatasetRelationshipIntelligence(input: {
  sourceDataset: DatasetIdentity
  datasets: DatasetIdentity[]
  cdeSignals?: DatasetCdeSignal[]
  stewardshipSignals?: DatasetStewardshipSignal[]
  incidentSignals?: DatasetIncidentCorrelationSignal[]
  lineageSignals?: DatasetLineageSignal[]
}) {
  const source = input.sourceDataset
  const datasetById = new Map(input.datasets.map((dataset) => [dataset.id, dataset]))
  const bucket = new Map<string, DatasetRelationshipSignal[]>()

  const sourceDomain = normalizedDomain(source.businessDomain)
  if (sourceDomain) {
    for (const dataset of input.datasets) {
      if (dataset.id === source.id) continue
      if (normalizedDomain(dataset.businessDomain) !== sourceDomain) continue
      pushSignal(bucket, dataset.id, {
        authority: 'GOVERNED_CATALOG_CONTEXT',
        signalType: 'SHARED_BUSINESS_DOMAIN',
        confidence: null,
        evidence: {
          business_domain: source.businessDomain?.trim() ?? null,
          semantics: 'Context only; shared domain does not establish dependency.',
        },
      })
    }
  }

  for (const signal of input.cdeSignals ?? []) {
    if (signal.targetDatasetId === source.id) continue
    if (signal.sourceMappingStatus !== 'APPROVED' || signal.targetMappingStatus !== 'APPROVED') continue
    const sourceConfidence = finiteConfidence(signal.sourceConfidence)
    const targetConfidence = finiteConfidence(signal.targetConfidence)
    const confidence = sourceConfidence === null
      ? targetConfidence
      : targetConfidence === null
        ? sourceConfidence
        : Math.min(sourceConfidence, targetConfidence)
    pushSignal(bucket, signal.targetDatasetId, {
      authority: 'APPROVED_CDE_MAPPING',
      signalType: 'SHARED_CRITICAL_DATA_ELEMENT',
      confidence,
      evidence: {
        cde_id: signal.cdeId,
        cde_key: signal.cdeKey,
        cde_name: signal.cdeName,
        criticality: signal.criticality,
        source_mapping_status: signal.sourceMappingStatus,
        target_mapping_status: signal.targetMappingStatus,
      },
    })
  }

  for (const signal of input.stewardshipSignals ?? []) {
    if (signal.targetDatasetId === source.id) continue
    if (
      signal.status !== 'ACTIVE'
      || signal.active !== true
      || signal.targetState !== 'CURRENT'
      || signal.subjectState !== 'CURRENT'
    ) continue
    pushSignal(bucket, signal.targetDatasetId, {
      authority: 'GOVERNED_STEWARDSHIP',
      signalType: 'SHARED_ACCOUNTABILITY_PRINCIPAL',
      confidence: null,
      evidence: {
        assignment_id: signal.assignmentId,
        principal_user_id: signal.principalUserId,
        role: signal.role,
        semantics: 'Shared accountability does not establish lineage or technical dependency.',
      },
    })
  }

  for (const signal of input.incidentSignals ?? []) {
    if (signal.targetDatasetId === source.id || signal.status !== 'ACTIVE') continue
    pushSignal(bucket, signal.targetDatasetId, {
      authority: 'OBSERVED_INCIDENT_CORRELATION',
      signalType: signal.correlationType,
      confidence: finiteConfidence(signal.confidence),
      evidence: {
        correlation_id: signal.correlationId,
        score: finiteConfidence(signal.score),
        correlation_type: signal.correlationType,
        semantics: 'Observed operational correlation; not a lineage assertion.',
      },
    })
  }

  for (const signal of input.lineageSignals ?? []) {
    if (signal.targetDatasetId === source.id) continue
    if (!['SOURCE_OBSERVED', 'HUMAN_CONFIRMED'].includes(signal.authorityState)) continue
    pushSignal(bucket, signal.targetDatasetId, {
      authority: 'SOURCE_AUTHORITATIVE_LINEAGE',
      signalType: signal.relationship,
      confidence: 1,
      evidence: {
        edge_id: signal.edgeId,
        direction: signal.direction,
        authority_state: signal.authorityState,
        origin: signal.origin,
        relationship: signal.relationship,
      },
    })
  }

  const relationships: DatasetRelationship[] = []
  for (const [datasetId, signals] of bucket) {
    const dataset = datasetById.get(datasetId)
    if (!dataset) continue
    const confidences = signals
      .map((signal) => signal.confidence)
      .filter((value): value is number => value !== null)
    relationships.push({
      datasetId,
      datasetName: dataset.name,
      businessDomain: dataset.businessDomain?.trim() || null,
      relationshipClass: classForSignals(signals),
      signals,
      evidenceCount: signals.length,
      maxConfidence: confidences.length ? Math.max(...confidences) : null,
    })
  }

  relationships.sort((left, right) => {
    const classDelta = CLASS_PRIORITY[right.relationshipClass] - CLASS_PRIORITY[left.relationshipClass]
    if (classDelta) return classDelta
    if (right.evidenceCount !== left.evidenceCount) return right.evidenceCount - left.evidenceCount
    return left.datasetName.localeCompare(right.datasetName)
  })

  return {
    sourceDataset: source,
    relationships,
    counts: {
      total: relationships.length,
      sourceAuthoritative: relationships.filter((item) => item.relationshipClass === 'SOURCE_AUTHORITATIVE_RELATIONSHIP').length,
      governed: relationships.filter((item) => item.relationshipClass === 'GOVERNED_RELATIONSHIP').length,
      correlated: relationships.filter((item) => item.relationshipClass === 'OBSERVED_CORRELATION').length,
      contextOnly: relationships.filter((item) => item.relationshipClass === 'CONTEXT_ONLY').length,
    },
  }
}
