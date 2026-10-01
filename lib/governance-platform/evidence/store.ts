import type { GovernanceEvidenceRecord } from './model.ts'
export interface GovernanceEvidenceStore{append(record:GovernanceEvidenceRecord):Promise<void>;listByPlan(projectId:string,planId:string):Promise<GovernanceEvidenceRecord[]>}
export class InMemoryGovernanceEvidenceStore implements GovernanceEvidenceStore{
 private records:GovernanceEvidenceRecord[]=[]
 async append(record:GovernanceEvidenceRecord){this.records.push(structuredClone(record))}
 async listByPlan(projectId:string,planId:string){return this.records.filter(r=>r.projectId===projectId&&r.planId===planId).map(r=>structuredClone(r))}
}
