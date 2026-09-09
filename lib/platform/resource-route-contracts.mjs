export const resourceRouteContracts = [
  {
    id: 'agent-definition',
    routeFile: 'app/agents/[agentKey]/[version]/page.tsx',
    routeBuilder: 'agent',
    identityParams: ['agentKey', 'version'],
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
]

// Dynamic pages that select a workspace/view rather than resolve a persistent resource
// must be explicitly excluded here with a durable rationale. The verifier rejects
// uncovered dynamic pages and exclusions without reasons.
export const dynamicPageExclusions = [
  {
    routeFile: 'app/home/[persona]/page.tsx',
    reason: 'Persona is a role landing selector, not a persistent resource identity.',
  },
]
