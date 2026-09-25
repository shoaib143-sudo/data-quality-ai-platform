export type ProductContextSignal = {
  key: string
  label: string
  state: 'AVAILABLE' | 'GAP' | 'NOT_VISIBLE'
  detail: string
  href: string | null
}

type ProductContextInput = {
  hasBusinessDescription: boolean
  hasOwner: boolean
  hasApprovedMeaning: boolean
  hasActiveContract: boolean | null
  hasScoredProfile: boolean | null
  hasLineage: boolean | null
  hasAgentActivity: boolean | null
}

/** A read-only context inventory. It never confers certification or execution authority. */
export function buildDataProductContext(input: ProductContextInput): ProductContextSignal[] {
  const signal = (key: string, label: string, present: boolean | null, detail: string, href: string | null): ProductContextSignal => ({
    key,
    label,
    state: present === null ? 'NOT_VISIBLE' : present ? 'AVAILABLE' : 'GAP',
    detail: present === null ? 'This context is outside your current workspace access.' : detail,
    href: present === null ? null : href,
  })

  return [
    signal('purpose', 'Business purpose', input.hasBusinessDescription, input.hasBusinessDescription ? 'A governed business description is recorded.' : 'Add the intended use and consumer value.', '/catalog'),
    signal('owner', 'Accountability', input.hasOwner, input.hasOwner ? 'A business owner or steward is assigned.' : 'Assign a business owner or steward.', '/stewardship'),
    signal('meaning', 'Business meaning', input.hasApprovedMeaning, input.hasApprovedMeaning ? 'Approved glossary or classification context is linked.' : 'Review and approve business terms or classifications.', '/glossary'),
    signal('contract', 'Consumer contract', input.hasActiveContract, input.hasActiveContract ? 'An active data contract is linked.' : 'Publish an approved, active data contract.', '/contracts'),
    signal('quality', 'Observed quality', input.hasScoredProfile, input.hasScoredProfile ? 'A completed profile has a persisted quality score.' : 'Run profiling and inspect its quality evidence.', '/profiling/explorer'),
    signal('lineage', 'Dependency context', input.hasLineage, input.hasLineage ? 'Persisted lineage connects this dataset.' : 'Connect source or downstream lineage evidence.', '/lineage'),
    signal('agents', 'Agent activity', input.hasAgentActivity, input.hasAgentActivity ? 'Recent governed agent runs are linked.' : 'No recent governed agent run is linked.', '/agents'),
  ]
}
