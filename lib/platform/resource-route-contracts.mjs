export const resourceRouteContracts = [
  {
    id: 'agent-definition',
    routeFile: 'app/agents/[agentKey]/[version]/page.tsx',
    routeBuilder: 'agent',
    identityParams: ['agentKey', 'version'],
    authenticationEvidence: ['await requireUser()'],
    resolverEvidence: [".eq('agent_key', agentKey)", ".eq('version', version)"],
    missingEvidence: ['if (!agentRow) notFound()'],
    sourceConsumers: [
      {
        file: 'app/agents/page.tsx',
        evidence: ['canonicalRoutes.agent(agent.agent_key, agent.version)'],
      },
    ],
    readOnly: true,
  },
  {
    id: 'agent-run',
    routeFile: 'app/agents/runs/[runId]/page.tsx',
    routeBuilder: 'agentRun',
    identityParams: ['runId'],
    authenticationEvidence: ['await requireUser()'],
    resolverEvidence: [".eq('id', runId)"],
    missingEvidence: ['Agent run not found'],
    sourceConsumers: [
      {
        file: 'app/agents/page.tsx',
        evidence: ['canonicalRoutes.agentRun(run.id)'],
      },
      {
        file: 'app/agents/[agentKey]/[version]/page.tsx',
        evidence: ['canonicalRoutes.agentRun(run.id)'],
      },
    ],
    readOnly: true,
  },
  {
    id: 'governed-dataset',
    routeFile: 'app/catalog/dataset/[datasetId]/page.tsx',
    routeBuilder: 'governedDataset',
    identityParams: ['datasetId'],
    authenticationEvidence: ['const user=await requireUser()'],
    resolverEvidence: [".eq('id',datasetId)"],
    missingEvidence: ['if(!datasetResult.data)notFound()'],
    sourceConsumers: [
      {
        file: 'app/catalog/catalog-manager.tsx',
        evidence: ['canonicalRoutes.governedDataset(dataset.id)'],
      },
    ],
    readOnly: true,
  },
  {
    id: 'governed-incident',
    routeFile: 'app/issues/[issueId]/page.tsx',
    routeBuilder: 'governedIncident',
    identityParams: ['issueId'],
    authenticationEvidence: ['const user = await requireUser()'],
    resolverEvidence: [".eq('id', issueId)", ".eq('organization_id', landing.organizationId)"],
    missingEvidence: ['if (!issueResult.data) notFound()', 'if (!projectResult.data) notFound()', 'if (!incident) notFound()'],
    sourceConsumers: [
      {
        file: 'app/issues/page.tsx',
        evidence: ['canonicalRoutes.governedIncident(issue.id)'],
      },
    ],
    readOnly: true,
  },
  {
    id: 'dataset-edit',
    routeFile: 'app/datasets/dataset/[datasetId]/edit/page.tsx',
    routeBuilder: 'datasetEdit',
    identityParams: ['datasetId'],
    authenticationEvidence: ['const user = await requireUser()'],
    resolverEvidence: [".eq('id', datasetId)", ".eq('organization_id', project.organization_id)", ".eq('user_id', user.id)"],
    missingEvidence: ['if (!dataset) notFound()', 'if (!project) notFound()', "if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) notFound()"],
    sourceConsumers: [
      {
        file: 'app/datasets/dataset-actions.tsx',
        evidence: ['canonicalRoutes.datasetEdit(datasetId)'],
      },
    ],
    readOnly: false,
  },
  {
    id: 'data-source-edit',
    routeFile: 'app/datasets/edit/[sourceId]/page.tsx',
    routeBuilder: 'sourceEdit',
    identityParams: ['sourceId'],
    authenticationEvidence: ['const user = await requireUser()'],
    resolverEvidence: [".eq('id', sourceId)", ".eq('organization_id', project.organization_id)", ".eq('user_id', user.id)"],
    missingEvidence: ['if (!source) notFound()', 'if (!project) notFound()', "if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) notFound()"],
    sourceConsumers: [
      {
        file: 'app/datasets/source-actions.tsx',
        evidence: ['canonicalRoutes.sourceEdit(sourceId)'],
      },
    ],
    readOnly: false,
  },
  {
    id: 'monitoring-domain',
    routeFile: 'app/monitoring/domain/[projectId]/page.tsx',
    routeBuilder: 'monitoringDomain',
    identityParams: ['projectId'],
    authenticationEvidence: ['const user = await requireUser()'],
    resolverEvidence: [".eq('project_id', projectId)", 'filterAuthorizedExecutionRuns(user.id'],
    missingEvidence: ['if (!authorizedRuns.length) notFound()', 'if (!domainRuns.length) notFound()'],
    sourceConsumers: [
      {
        file: 'app/monitoring/job-monitor.tsx',
        evidence: ['/monitoring/domain/${encodeURIComponent(cell.project.id)}'],
      },
    ],
    readOnly: true,
  },
]

// Dynamic pages that select a workspace/view or carry a transient signed channel binding,
// rather than resolve a persistent canonical resource identity, must be explicitly excluded
// here with a durable rationale. The verifier rejects uncovered dynamic pages and exclusions
// without reasons.
export const dynamicPageExclusions = [
  {
    routeFile: 'app/home/[persona]/page.tsx',
    reason: 'Persona is a role landing selector, not a persistent resource identity.',
  },
  {
    routeFile: 'app/approvals/external/[token]/page.tsx',
    reason: 'The signed approval token is a transient channel binding; authenticated approval authority and the canonical request are revalidated server-side.',
  },
]
