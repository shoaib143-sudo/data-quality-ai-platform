import React from 'react'
import {createRoot} from 'react-dom/client'
import {LivingJobMonitor} from '../../../app/monitoring/living-job-monitor'
import {SYNTHETIC_SNAPSHOT} from '../../fixtures/execution-monitor/synthetic'
const params = new URLSearchParams(location.search)
const root = SYNTHETIC_SNAPSHOT.runs[0]
createRoot(document.getElementById('root')!).render(<LivingJobMonitor
  initialRuns={[root]} initialRunId={params.get('run') ?? root.id} initialBranchId={params.get('branch') ?? params.get('run') ?? root.id}
  initialAgents={[]} initialDatasets={[]} treeEnabled={params.get('tree') !== 'false'}/>)
