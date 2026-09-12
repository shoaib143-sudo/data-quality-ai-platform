export type ReadinessManualRouteKind = 'SOURCE_EDIT' | 'DATASET_EDIT' | 'NONE'

export type ReadinessManualRemediationDescriptor = {
  blocker: string
  affectedObject: 'READINESS_POLICY' | 'DATASET' | 'SOURCE' | 'SOURCE_SCOPE' | 'EXECUTION_BINDING' | 'DISCOVERY_EVIDENCE' | 'DATASET_VERSION' | 'UNKNOWN'
  requiredCapability: 'source.manage' | 'catalog.update' | 'admin.manage' | null
  routeKind: ReadinessManualRouteKind
  postcondition: string
  unavailableGuidance?: string
}

const DESCRIPTORS: Record<string, ReadinessManualRemediationDescriptor> = {
  READINESS_RULE_NOT_ONBOARDED: {
    blocker: 'READINESS_RULE_NOT_ONBOARDED',
    affectedObject: 'READINESS_POLICY',
    requiredCapability: 'admin.manage',
    routeKind: 'NONE',
    postcondition: 'A deterministic profiling-readiness policy is onboarded for this source type and the verifier can assess the dataset.',
    unavailableGuidance: 'A governance administrator must onboard a profiling-readiness policy for this source type. There is no self-service onboarding workflow in the product today.',
  },
  DATASET_NOT_ACTIVE: {
    blocker: 'DATASET_NOT_ACTIVE',
    affectedObject: 'DATASET',
    requiredCapability: 'catalog.update',
    routeKind: 'NONE',
    postcondition: 'The governed dataset lifecycle state is ACTIVE and deterministic readiness is re-evaluated.',
    unavailableGuidance: 'Dataset lifecycle activation is not available from the current dataset edit form. An authorized dataset administrator must perform the governed lifecycle change.',
  },
  SOURCE_NOT_ACTIVE: {
    blocker: 'SOURCE_NOT_ACTIVE',
    affectedObject: 'SOURCE',
    requiredCapability: 'source.manage',
    routeKind: 'SOURCE_EDIT',
    postcondition: 'The source is ACTIVE and deterministic readiness is re-evaluated.',
  },
  SOURCE_NOT_OBSERVED_READY: {
    blocker: 'SOURCE_NOT_OBSERVED_READY',
    affectedObject: 'SOURCE',
    requiredCapability: 'source.manage',
    routeKind: 'SOURCE_EDIT',
    postcondition: 'The source has fresh observed readiness evidence and reaches OBSERVED_READY.',
  },
  GOVERNED_SCOPE_NOT_READY: {
    blocker: 'GOVERNED_SCOPE_NOT_READY',
    affectedObject: 'SOURCE_SCOPE',
    requiredCapability: 'source.manage',
    routeKind: 'SOURCE_EDIT',
    postcondition: 'An active governed source scope exists with a valid current scope-version identity.',
  },
  EXECUTION_SOURCE_NOT_BOUND: {
    blocker: 'EXECUTION_SOURCE_NOT_BOUND',
    affectedObject: 'EXECUTION_BINDING',
    requiredCapability: 'source.manage',
    routeKind: 'SOURCE_EDIT',
    postcondition: 'The latest governed dataset version has an active profiling execution-source binding.',
  },
  DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE: {
    blocker: 'DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE',
    affectedObject: 'DISCOVERY_EVIDENCE',
    requiredCapability: 'source.manage',
    routeKind: 'SOURCE_EDIT',
    postcondition: 'A complete, non-truncated, zero-failure discovery manifest exists for the current active scope version.',
  },
  DATASET_VERSION_NOT_LATEST: {
    blocker: 'DATASET_VERSION_NOT_LATEST',
    affectedObject: 'DATASET_VERSION',
    requiredCapability: null,
    routeKind: 'NONE',
    postcondition: 'Profiling targets the latest governed dataset version.',
    unavailableGuidance: 'Select the latest governed dataset version. No mutation is required for this blocker.',
  },
  DATASET_NOT_FOUND: {
    blocker: 'DATASET_NOT_FOUND',
    affectedObject: 'DATASET',
    requiredCapability: null,
    routeKind: 'NONE',
    postcondition: 'An accessible dataset in the current project is selected.',
    unavailableGuidance: 'Confirm the project and dataset selection. No remediation mutation is available for an inaccessible or missing dataset.',
  },
  DATASET_VERSION_NOT_FOUND: {
    blocker: 'DATASET_VERSION_NOT_FOUND',
    affectedObject: 'DATASET_VERSION',
    requiredCapability: null,
    routeKind: 'NONE',
    postcondition: 'An accessible governed dataset version in the current project is selected.',
    unavailableGuidance: 'Confirm the project and dataset version selection. No remediation mutation is available for an inaccessible or missing version.',
  },
}

export function getReadinessManualRemediationDescriptor(blocker: string): ReadinessManualRemediationDescriptor {
  return DESCRIPTORS[blocker] ?? {
    blocker,
    affectedObject: 'UNKNOWN',
    requiredCapability: null,
    routeKind: 'NONE',
    postcondition: 'Deterministic readiness is re-evaluated only after an authorized, known remediation path is available.',
    unavailableGuidance: 'No governed self-service remediation route is defined for this blocker. Contact a project administrator rather than attempting an unrelated change.',
  }
}
