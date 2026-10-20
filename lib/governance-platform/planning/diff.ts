import type { CanonicalGovernanceObject } from '../canonical/model.ts'
import type { DesiredGovernanceObject } from '../desired-state/model.ts'
import { normalizeGovernanceRelationships,stableGovernanceFingerprint } from './fingerprint.ts'

export type GovernanceDiffAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'NOOP'

export type GovernanceDiff = {
  action: GovernanceDiffAction
  desired: DesiredGovernanceObject
  actual?: CanonicalGovernanceObject
}

function comparable(value: CanonicalGovernanceObject | DesiredGovernanceObject) {
  return stableGovernanceFingerprint({
    type: value.type,
    externalKey: value.externalKey,
    name: value.name,
    description: value.description ?? null,
    attributes: value.attributes,
    relationships: normalizeGovernanceRelationships(value.relationships),
  })
}

export function diffGovernanceState(
  desired: DesiredGovernanceObject[],
  actual: CanonicalGovernanceObject[],
): GovernanceDiff[] {
  const actualByKey = new Map(actual.map(item => [`${item.type}:${item.externalKey}`, item]))

  return desired.map(item => {
    const key = `${item.type}:${item.externalKey}`
    const observed = actualByKey.get(key)

    if (item.state === 'absent') {
      return { action: observed ? 'DELETE' : 'NOOP', desired: item, actual: observed }
    }

    if (!observed) return { action: 'CREATE', desired: item }
    if (comparable(item) === comparable(observed)) return { action: 'NOOP', desired: item, actual: observed }
    return { action: 'UPDATE', desired: item, actual: observed }
  })
}
