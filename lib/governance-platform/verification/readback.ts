import type { CanonicalGovernanceObject } from '../canonical/model.ts'
import { stableGovernanceFingerprint } from '../planning/fingerprint.ts'

export type ReadbackVerification={status:'VERIFIED'|'MISMATCH'|'MISSING';expectedFingerprint:string;observedFingerprint:string|null}

function comparable(object:CanonicalGovernanceObject){return {type:object.type,externalKey:object.externalKey,name:object.name,description:object.description,attributes:object.attributes,relationships:object.relationships}}

export function verifyGovernanceReadback(expected:CanonicalGovernanceObject,observed:CanonicalGovernanceObject|null):ReadbackVerification{
 const expectedFingerprint=stableGovernanceFingerprint(comparable(expected))
 if(!observed)return{status:'MISSING',expectedFingerprint,observedFingerprint:null}
 const observedFingerprint=stableGovernanceFingerprint(comparable(observed))
 return{status:expectedFingerprint===observedFingerprint?'VERIFIED':'MISMATCH',expectedFingerprint,observedFingerprint}
}
