import type { Run, Snapshot } from '../../../lib/monitoring/execution-contract'
export const syntheticRun=(id:string,parent:string|null,status='RUNNING',name='Agent'):Run=>({id,parent_run_id:parent,project_id:'11111111-1111-4111-a111-111111111111',agent_definition_id:id,dataset_id:null,status,created_at:'2026-09-12T12:00:00Z',started_at:'2026-09-12T12:00:00Z',completed_at:null,error_code:null,name})
export const SYNTHETIC_SNAPSHOT:Snapshot={
  rootId:'00000000-0000-4000-a000-000000000001',fetchedAt:'2026-09-12T12:00:00Z',
  runs:[syntheticRun('00000000-0000-4000-a000-000000000001',null,'RUNNING','Governance'),
    syntheticRun('00000000-0000-4000-a000-000000000002','00000000-0000-4000-a000-000000000001','SUCCEEDED','Profiling'),
    syntheticRun('00000000-0000-4000-a000-000000000003','00000000-0000-4000-a000-000000000001','RUNNING','Data Quality'),
    syntheticRun('00000000-0000-4000-a000-000000000004','00000000-0000-4000-a000-000000000001','QUEUED','Investigator'),
    syntheticRun('00000000-0000-4000-a000-000000000005','00000000-0000-4000-a000-000000000001','QUEUED','Steward')],
  steps:[],plans:[],waits:[],warnings:['SYNTHETIC VALIDATION DATA. These are not production executions.'],truncated:false,
  edges:[{id:'synthetic-dependency-1',source:'00000000-0000-4000-a000-000000000003',target:'00000000-0000-4000-a000-000000000004',kind:'dependency',condition:'SUCCESS',satisfied:false,evidence:'synthetic'},
  {id:'synthetic-dependency-2',source:'00000000-0000-4000-a000-000000000004',target:'00000000-0000-4000-a000-000000000005',kind:'dependency',condition:'SUCCESS',satisfied:false,evidence:'synthetic'}],
}
