import type { PresentationPlan } from '@/lib/governance/persona-presentation'

export type PresentationMetricIcon = 'gauge' | 'database' | 'alert' | 'check' | 'users' | 'tag' | 'lineage' | 'activity' | 'book'

export type PresentationMetric = {
  label: string
  value: string
  detail: string
  href: string
  icon: PresentationMetricIcon
}

export type PresentationLandingData = {
  confidence: number | null
  governedAssets: number
  activeSources: number
  materialFindings: number
  highFindings: number
  failedControls: number
  openAlerts: number
  coverage: number
  affectedDomains: number
  certifiedDatasets: number
  pendingCertifications: number
  pendingWaivers: number
  unresolvedIssues: number
  ownershipCoverage: number
  domainAssignedCoverage: number
  approvedGlossaryMappings: number
  approvedClassifications: number
  cdeMappings: number
  failedControlEvaluations: number
  datasets: { approvedClassifications: number }[]
  businessImpact: { count: number }[]
}

export type RoleLandingPresentation = {
  plan: PresentationPlan
  heroTitle: string
  heroDetail: string
  trendTitle: string
  attentionTitle: string
  contextTitle: string
  actionKicker: string
  actionTitle: string
  actionHref: string
  metrics: PresentationMetric[]
  aiStarters: string[]
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? 'N/A' : `${Math.round(value * 100)}%`
}

export function buildRoleLandingPresentation(plan: PresentationPlan, data: PresentationLandingData): RoleLandingPresentation {
  const decisions = data.pendingCertifications + data.pendingWaivers
  const impacts = data.businessImpact.reduce((sum, item) => sum + item.count, 0)
  const metadataGaps = Math.max(0, data.governedAssets - Math.round((data.domainAssignedCoverage / 100) * data.governedAssets))
  const unclassified = Math.max(0, data.governedAssets - data.datasets.filter(item => item.approvedClassifications > 0).length)

  switch (plan.primary) {
    case 'executive-health': return {
      plan,
      heroTitle: `${data.highFindings} material risks require executive visibility`,
      heroDetail: `${data.governedAssets} governed datasets are in scope, with ${data.ownershipCoverage}% stewardship coverage and ${impacts} linked business impacts.`,
      trendTitle: 'Enterprise data trust trend',
      attentionTitle: 'Material business risks',
      contextTitle: 'Data Domain health',
      actionKicker: 'Executive attention',
      actionTitle: 'Review the highest-priority decision',
      actionHref: '/issues',
      metrics: [
        { label: 'Material risks', value: String(data.highFindings), detail: `${data.materialFindings} material findings`, href: '/issues', icon: 'alert' },
        { label: 'Business impact', value: String(impacts), detail: 'Linked reports, KPIs, processes and decisions', href: '/reports', icon: 'lineage' },
        { label: 'Decisions in progress', value: String(decisions), detail: 'Certification and exception decisions', href: '/stewardship', icon: 'check' },
        { label: 'Stewardship coverage', value: `${data.ownershipCoverage}%`, detail: 'Governed datasets with active accountability', href: '/stewardship', icon: 'users' },
      ],
      aiStarters: ['What needs my attention today?', 'Where is our biggest data risk?', 'What changed since my last review?', 'Which business decisions are affected?', 'Are we improving overall?'],
    }
    case 'trusted-data-discovery': return {
      plan,
      heroTitle: `${data.certifiedDatasets} certified datasets are ready for trusted use`,
      heroDetail: `${data.governedAssets} governed datasets span ${data.affectedDomains} Data Domains with ${data.unresolvedIssues} known issues to consider before use.`,
      trendTitle: 'Trusted data confidence trend',
      attentionTitle: 'Known concerns affecting governed data',
      contextTitle: 'Trusted data by Data Domain',
      actionKicker: 'Safe-use guidance',
      actionTitle: 'Find trusted data for your business need',
      actionHref: '/catalog',
      metrics: [
        { label: 'Certified datasets', value: String(data.certifiedDatasets), detail: 'Governed datasets with certified status', href: '/catalog?q=CERTIFIED', icon: 'check' },
        { label: 'Known issues', value: String(data.unresolvedIssues), detail: 'Unresolved governed data issues', href: '/issues', icon: 'alert' },
        { label: 'Governed datasets', value: String(data.governedAssets), detail: `${data.affectedDomains} represented Data Domains`, href: '/catalog', icon: 'database' },
        { label: 'Business terms linked', value: String(data.approvedGlossaryMappings), detail: 'Approved glossary mappings', href: '/glossary', icon: 'book' },
      ],
      aiStarters: ['Find data for a business question', 'Can I trust the data I use?', 'Explain this dataset in simple terms', 'Show known issues for my data', 'What governed data should I use?'],
    }
    case 'decision-queue': return {
      plan,
      heroTitle: `${decisions} owner decisions are currently in progress`,
      heroDetail: `${data.ownershipCoverage}% of governed datasets in scope have active accountability, with ${data.highFindings} high-risk findings requiring business attention.`,
      trendTitle: 'Owned Data Domain trust trend',
      attentionTitle: 'Risks and decisions requiring owner attention',
      contextTitle: 'Owned Data Domain health',
      actionKicker: 'Owner decision',
      actionTitle: 'Review owner decisions and remediation',
      actionHref: '/stewardship',
      metrics: [
        { label: 'High-risk findings', value: String(data.highFindings), detail: 'Critical and high findings', href: '/issues', icon: 'alert' },
        { label: 'Critical data mappings', value: String(data.cdeMappings), detail: 'Governed critical-data mappings', href: '/classification', icon: 'tag' },
        { label: 'Pending decisions', value: String(decisions), detail: 'Certification and exception decisions', href: '/stewardship', icon: 'check' },
        { label: 'Stewardship coverage', value: `${data.ownershipCoverage}%`, detail: 'Datasets with active governed stewardship assignments', href: '/stewardship', icon: 'users' },
      ],
      aiStarters: ['What requires my decision today?', 'Which owned data is outside tolerance?', 'What critical data is affected?', 'Who is resolving the highest risks?', 'What should I prioritize next?'],
    }
    case 'product-trust': return {
      plan,
      heroTitle: `${data.certifiedDatasets} governed data products are certified`,
      heroDetail: `Current product trust is ${pct(data.confidence)} with ${data.unresolvedIssues} open product issues and ${impacts} linked consumer-impact dependencies.`,
      trendTitle: 'Data product trust trend',
      attentionTitle: 'Consumer-impacting data product risks',
      contextTitle: 'Product trust by Data Domain',
      actionKicker: 'Product outcome',
      actionTitle: 'Review data products requiring attention',
      actionHref: '/catalog',
      metrics: [
        { label: 'Product trust', value: pct(data.confidence), detail: 'Latest governed quality evidence', href: '/data-quality', icon: 'gauge' },
        { label: 'Certified products', value: String(data.certifiedDatasets), detail: 'Certified governed datasets', href: '/catalog?q=CERTIFIED', icon: 'check' },
        { label: 'Consumer-impact links', value: String(impacts), detail: 'Business dependencies linked to data products', href: '/lineage', icon: 'lineage' },
        { label: 'Open product issues', value: String(data.unresolvedIssues), detail: 'Unresolved governed product issues', href: '/issues', icon: 'alert' },
      ],
      aiStarters: ['Which data products need attention?', 'Are consumers affected by current issues?', 'What is the trust trend for my products?', 'Which products are ready for certification?', 'Show downstream impact of product risks'],
    }
    case 'steward-work-queue': return {
      plan,
      heroTitle: `${data.unresolvedIssues} governed issues are awaiting stewardship attention`,
      heroDetail: `${data.materialFindings} material findings and ${metadataGaps} Data Domain metadata gaps are in the current governed scope.`,
      trendTitle: 'Stewarded data confidence trend',
      attentionTitle: 'Stewardship work requiring investigation',
      contextTitle: 'Stewardship coverage by Data Domain',
      actionKicker: 'Next stewardship action',
      actionTitle: 'Investigate the highest-priority issue',
      actionHref: '/issues',
      metrics: [
        { label: 'Open issues', value: String(data.unresolvedIssues), detail: 'Issues awaiting resolution', href: '/issues', icon: 'alert' },
        { label: 'Material findings', value: String(data.materialFindings), detail: `${data.highFindings} high priority`, href: '/profiling/explorer', icon: 'activity' },
        { label: 'Data Domain metadata gaps', value: String(metadataGaps), detail: `${data.domainAssignedCoverage}% Data Domain assignment coverage`, href: '/catalog', icon: 'tag' },
        { label: 'Classification evidence', value: String(data.approvedClassifications), detail: 'Approved classifications', href: '/classification', icon: 'check' },
      ],
      aiStarters: ['What needs my attention today?', 'Which issues should I investigate first?', 'Where are metadata gaps?', 'Which controls or rules are failing?', 'What remediation needs coordination?'],
    }
    case 'governance-programme': return {
      plan,
      heroTitle: `${data.ownershipCoverage}% stewardship coverage across the governed scope`,
      heroDetail: `${data.failedControlEvaluations} control evaluations are not passing and ${data.pendingWaivers} exceptions remain open.`,
      trendTitle: 'Governance outcome trend',
      attentionTitle: 'Governance gaps requiring intervention',
      contextTitle: 'Governance health by Data Domain',
      actionKicker: 'Programme intervention',
      actionTitle: 'Target the largest governance gap',
      actionHref: '/reports',
      metrics: [
        { label: 'Control failures', value: String(data.failedControlEvaluations), detail: 'Governance control evaluations not passing', href: '/data-quality/rules', icon: 'alert' },
        { label: 'Critical data coverage', value: String(data.cdeMappings), detail: 'Governed critical-data mappings', href: '/classification', icon: 'tag' },
        { label: 'Stewardship coverage', value: `${data.ownershipCoverage}%`, detail: 'Datasets with active governed stewardship assignments', href: '/stewardship', icon: 'users' },
        { label: 'Open exceptions', value: String(data.pendingWaivers), detail: 'Control waivers awaiting decision', href: '/audit', icon: 'check' },
      ],
      aiStarters: ['Where are our governance gaps?', 'Which Data Domains need intervention?', 'Are controls working effectively?', 'Where is ownership incomplete?', 'Are governance outcomes improving?'],
    }
    case 'control-assurance': return {
      plan,
      heroTitle: `${data.failedControlEvaluations} control evaluations are currently not passing`,
      heroDetail: `${data.pendingWaivers} open exceptions and ${data.highFindings} high-severity findings contribute to current assurance exposure.`,
      trendTitle: 'Governed data confidence trend',
      attentionTitle: 'Regulatory and control exposure',
      contextTitle: 'Exposure by Data Domain',
      actionKicker: 'Assurance priority',
      actionTitle: 'Review the most material control exposure',
      actionHref: '/audit',
      metrics: [
        { label: 'Failed controls', value: String(data.failedControlEvaluations), detail: 'Non-passing governance evaluations', href: '/data-quality/rules', icon: 'alert' },
        { label: 'Open exceptions', value: String(data.pendingWaivers), detail: 'Control waivers awaiting decision', href: '/audit', icon: 'check' },
        { label: 'Material findings', value: String(data.highFindings), detail: 'Critical and high findings', href: '/issues', icon: 'activity' },
        { label: 'Evidence coverage', value: `${data.coverage}%`, detail: 'Datasets with completed governed profiling evidence', href: '/audit', icon: 'database' },
      ],
      aiStarters: ['Show open control failures', 'Where is regulatory exposure highest?', 'Which exceptions need review?', 'Is audit evidence complete?', 'What risks need escalation?'],
    }
    case 'privacy-exposure': return {
      plan,
      heroTitle: `${unclassified} governed datasets lack approved classification evidence`,
      heroDetail: `${data.approvedClassifications} approved classifications and ${impacts} linked downstream dependencies define the current privacy review context.`,
      trendTitle: 'Governed data confidence trend',
      attentionTitle: 'Sensitive-data and privacy risk signals',
      contextTitle: 'Privacy evidence by Data Domain',
      actionKicker: 'Privacy review',
      actionTitle: 'Review privacy and classification exposure',
      actionHref: '/classification-privacy',
      metrics: [
        { label: 'Approved classifications', value: String(data.approvedClassifications), detail: 'Governed classification evidence', href: '/classification', icon: 'tag' },
        { label: 'Unclassified datasets', value: String(unclassified), detail: 'Datasets without approved classification evidence', href: '/classification-privacy', icon: 'alert' },
        { label: 'Privacy-impact links', value: String(impacts), detail: 'Business dependencies connected to governed data', href: '/lineage', icon: 'lineage' },
        { label: 'Open governed issues', value: String(data.unresolvedIssues), detail: 'Issues requiring privacy or security review', href: '/issues', icon: 'activity' },
      ],
      aiStarters: ['Where is sensitive data exposed?', 'Which datasets lack classification?', 'Show privacy risks by Data Domain', 'What downstream assets depend on sensitive data?', 'Which privacy issues need action?'],
    }
    case 'platform-operations': return {
      plan,
      heroTitle: `${data.openAlerts} operational alerts require platform review`,
      heroDetail: `${data.activeSources} active sources support ${data.governedAssets} governed datasets with ${data.coverage}% current profiling evidence coverage.`,
      trendTitle: 'Governed data operating trend',
      attentionTitle: 'Governance operational signals',
      contextTitle: 'Governed estate operating footprint',
      actionKicker: 'Platform operation',
      actionTitle: 'Review degraded governance operations',
      actionHref: '/monitoring',
      metrics: [
        { label: 'Active sources', value: String(data.activeSources), detail: 'Currently active data sources', href: '/datasets', icon: 'database' },
        { label: 'Operational alerts', value: String(data.openAlerts), detail: 'Unresolved observability alerts', href: '/monitoring', icon: 'alert' },
        { label: 'Failed quality controls', value: String(data.failedControls), detail: 'Failed quality rule executions', href: '/data-quality/rules', icon: 'activity' },
        { label: 'Profiling coverage', value: `${data.coverage}%`, detail: 'Datasets with current completed profiling evidence', href: '/profiling/explorer', icon: 'check' },
      ],
      aiStarters: ['Is the governance platform healthy?', 'Which sources or jobs are failing?', 'What workflows need attention?', 'Where is configuration incomplete?', 'Summarize operational governance alerts'],
    }
    case 'technical-remediation': return {
      plan,
      heroTitle: `${data.openAlerts} technical alerts require remediation review`,
      heroDetail: `${data.activeSources} active sources and ${data.failedControls} failed quality controls define the current technical operating picture.`,
      trendTitle: 'Technical data health trend',
      attentionTitle: 'Technical signals requiring remediation',
      contextTitle: 'Technical health by Data Domain',
      actionKicker: 'Technical remediation',
      actionTitle: 'Resolve the highest-impact technical signal',
      actionHref: '/observability',
      metrics: [
        { label: 'Active sources', value: String(data.activeSources), detail: 'Sources currently available', href: '/datasets', icon: 'database' },
        { label: 'Technical alerts', value: String(data.openAlerts), detail: 'Unresolved observability alerts', href: '/observability', icon: 'alert' },
        { label: 'Failed controls', value: String(data.failedControls), detail: 'Failed quality rule executions', href: '/data-quality/rules', icon: 'activity' },
        { label: 'Profiling coverage', value: `${data.coverage}%`, detail: 'Current profiling evidence coverage', href: '/profiling/explorer', icon: 'check' },
      ],
      aiStarters: ['Which technical signals need attention?', 'Show failed profiling or quality jobs', 'Where are source health problems?', 'What changed in the schema?', 'What should be remediated first?'],
    }
    case 'source-impact': return {
      plan,
      heroTitle: `${data.openAlerts} source alerts may affect downstream consumers`,
      heroDetail: `${impacts} linked downstream dependencies and ${data.highFindings} high-risk findings provide the current source-impact picture.`,
      trendTitle: 'Source reliability trend',
      attentionTitle: 'Upstream defects affecting downstream consumers',
      contextTitle: 'Source impact by Data Domain',
      actionKicker: 'Upstream remediation',
      actionTitle: 'Address the highest-impact source defect',
      actionHref: '/observability',
      metrics: [
        { label: 'Active sources', value: String(data.activeSources), detail: 'Currently active source connections', href: '/datasets', icon: 'database' },
        { label: 'Source alerts', value: String(data.openAlerts), detail: 'Unresolved observability alerts', href: '/observability', icon: 'alert' },
        { label: 'High-risk findings', value: String(data.highFindings), detail: 'Critical and high findings', href: '/issues', icon: 'activity' },
        { label: 'Downstream dependencies', value: String(impacts), detail: 'Linked business impacts', href: '/lineage', icon: 'lineage' },
      ],
      aiStarters: ['Is my source causing downstream issues?', 'What changed in my source?', 'Which defects keep recurring?', 'Who is affected downstream?', 'What upstream fix should I prioritize?'],
    }
    case 'metadata-intelligence': return {
      plan,
      heroTitle: `${data.domainAssignedCoverage}% of governed datasets have Data Domain assignment`,
      heroDetail: `${data.approvedGlossaryMappings} approved glossary mappings and ${data.approvedClassifications} approved classifications support metadata understanding.`,
      trendTitle: 'Metadata-supported data confidence trend',
      attentionTitle: 'Metadata gaps requiring analysis',
      contextTitle: 'Metadata coverage by Data Domain',
      actionKicker: 'Metadata improvement',
      actionTitle: 'Review the largest metadata gap',
      actionHref: '/catalog',
      metrics: [
        { label: 'Data Domain assignment', value: `${data.domainAssignedCoverage}%`, detail: 'Datasets assigned to a Data Domain', href: '/catalog', icon: 'tag' },
        { label: 'Stewardship coverage', value: `${data.ownershipCoverage}%`, detail: 'Datasets with active governed stewardship assignments', href: '/catalog', icon: 'users' },
        { label: 'Glossary mappings', value: String(data.approvedGlossaryMappings), detail: 'Approved dataset and column term mappings', href: '/glossary', icon: 'book' },
        { label: 'Classifications', value: String(data.approvedClassifications), detail: 'Approved classification evidence', href: '/classification', icon: 'check' },
      ],
      aiStarters: ['Show metadata gaps by dataset', 'Which datasets lack business terms?', 'Where is ownership missing?', 'Show lineage and metadata coverage', 'Which metadata should be improved first?'],
    }
    case 'quality-diagnostics': return {
      plan,
      heroTitle: `Current quality score is ${pct(data.confidence)}`,
      heroDetail: `${data.materialFindings} material findings, ${data.failedControls} failed quality controls and ${data.coverage}% profiling coverage define the current diagnostic picture.`,
      trendTitle: 'Data quality trend',
      attentionTitle: 'Quality findings requiring investigation',
      contextTitle: 'Quality health by Data Domain',
      actionKicker: 'Quality investigation',
      actionTitle: 'Investigate the highest-priority quality issue',
      actionHref: '/profiling/explorer',
      metrics: [
        { label: 'Quality score', value: pct(data.confidence), detail: 'Latest scored profiling evidence', href: '/data-quality', icon: 'gauge' },
        { label: 'Material findings', value: String(data.materialFindings), detail: `${data.highFindings} critical or high`, href: '/profiling/explorer', icon: 'alert' },
        { label: 'Failed quality controls', value: String(data.failedControls), detail: 'Failed quality rule executions', href: '/data-quality/rules', icon: 'activity' },
        { label: 'Profiled datasets', value: `${data.coverage}%`, detail: 'Current completed profiling coverage', href: '/profiling/explorer', icon: 'check' },
      ],
      aiStarters: ['Why did quality change for this dataset?', 'Show top quality issues and root causes', 'Compare quality across Data Domains', 'Which quality dimension is weakest?', 'Recommend evidence-backed improvements'],
    }
    default: throw new Error(`No governed landing renderer for presentation primitive: ${plan.primary}`)
  }
}
