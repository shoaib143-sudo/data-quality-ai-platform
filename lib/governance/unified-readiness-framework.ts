import type { OrganizationAssessmentProfile } from './maturity-framework.ts'

export const UNIFIED_READINESS_FRAMEWORK_VERSION = 'DN-URA-1.0' as const

export type ReadinessDimensionId =
  | 'strategy'
  | 'discoverability'
  | 'quality'
  | 'semantics'
  | 'access'
  | 'governance'
  | 'trust'
  | 'ai-governance'
  | 'observability'
  | 'people'

export type ReadinessUseCase =
  | 'ANALYTICS_BI'
  | 'PREDICTIVE_ML'
  | 'GENERATIVE_AI'
  | 'RAG_ENTERPRISE_SEARCH'
  | 'AI_COPILOT'
  | 'AUTONOMOUS_AGENT'
  | 'MULTI_AGENT'
  | 'CUSTOM'

export type EvidenceMode = 'DECLARATIVE' | 'OBSERVABLE' | 'CORROBORATABLE' | 'EVIDENCE_REQUIRED'
export type ReadinessCriticality = 'CRITICAL' | 'HIGH' | 'STANDARD' | 'CONTEXTUAL'

export type ReadinessContext = OrganizationAssessmentProfile & {
  useCases?: ReadinessUseCase[]
  operatesAutonomousAgents?: boolean
  requiresRealTimeData?: boolean
  hasMasterDataRequirement?: boolean
}

export type ReadinessApplicabilityRule = {
  key: keyof ReadinessContext
  equals?: string | boolean
  includes?: ReadinessUseCase
}

export type FrameworkMapping = {
  framework: 'DN-GMA-1.0' | 'NIST-AI-RMF' | 'INFORMATICA-CONCEPT' | 'DATANEXUS'
  reference: string
  relationship: 'DIRECT' | 'CONTRIBUTES' | 'CONCEPTUAL'
}

export type ReadinessCapability = {
  id: string
  dimensionId: ReadinessDimensionId
  label: string
  description: string
  criticality: ReadinessCriticality
  defaultTarget: 0 | 1 | 2 | 3 | 4 | 5
  evidenceMode: EvidenceMode
  observationSignals: readonly string[]
  humanPrompt?: string
  applicability?: readonly ReadinessApplicabilityRule[]
  mappings: readonly FrameworkMapping[]
  recommendedAction: string
  dataNexusAction: string
}

export const READINESS_DIMENSIONS = [
  { id: 'strategy', label: 'Strategy & Business Value' },
  { id: 'discoverability', label: 'Data Discoverability & Metadata' },
  { id: 'quality', label: 'Data Quality & Master Data' },
  { id: 'semantics', label: 'Semantic Context & Knowledge' },
  { id: 'access', label: 'Accessibility, Integration & Freshness' },
  { id: 'governance', label: 'Governance, Privacy & Security' },
  { id: 'trust', label: 'Lineage, Provenance & Trust' },
  { id: 'ai-governance', label: 'AI Governance & Responsible AI' },
  { id: 'observability', label: 'Observability & Operational Resilience' },
  { id: 'people', label: 'People, Operating Model & Adoption' },
] as const

const dn = (reference: string): FrameworkMapping => ({ framework: 'DATANEXUS', reference, relationship: 'DIRECT' })
const gma = (reference: string): FrameworkMapping => ({ framework: 'DN-GMA-1.0', reference, relationship: 'CONTRIBUTES' })
const nist = (reference: string): FrameworkMapping => ({ framework: 'NIST-AI-RMF', reference, relationship: 'CONCEPTUAL' })
const inf = (reference: string): FrameworkMapping => ({ framework: 'INFORMATICA-CONCEPT', reference, relationship: 'CONCEPTUAL' })

export const READINESS_CAPABILITIES: readonly ReadinessCapability[] = [
  { id:'URA-STRAT-VALUE-001', dimensionId:'strategy', label:'Strategy and measurable value', description:'Priority data and AI use cases have accountable outcomes and measurable value.', criticality:'HIGH', defaultTarget:4, evidenceMode:'CORROBORATABLE', observationSignals:['registered_use_cases','outcome_metrics','accountable_owners'], humanPrompt:'How consistently are priority data and AI use cases tied to accountable owners and measurable outcomes?', mappings:[gma('PURPOSE-STRATEGY'),gma('PURPOSE-VALUE'),dn('governed-use-cases')], recommendedAction:'Prioritize use cases with owners, target outcomes, and review criteria.', dataNexusAction:'Register use cases and link them to governed assets, owners, controls, and outcomes.' },
  { id:'URA-DISC-CATALOG-001', dimensionId:'discoverability', label:'Catalog and metadata coverage', description:'Critical data is discoverable with sufficient technical and business metadata.', criticality:'HIGH', defaultTarget:4, evidenceMode:'OBSERVABLE', observationSignals:['catalog_coverage','metadata_completeness','owner_coverage','classification_coverage'], mappings:[gma('PRACTICES-METADATA'),inf('Discoverability / catalog coverage'),dn('catalog')], recommendedAction:'Increase governed catalog and metadata coverage for critical assets.', dataNexusAction:'Discover assets, measure metadata completeness, classify data, and assign owners.' },
  { id:'URA-QUAL-DQ-001', dimensionId:'quality', label:'Data quality fitness', description:'Critical data is profiled, controlled, and monitored against fitness-for-use expectations.', criticality:'CRITICAL', defaultTarget:4, evidenceMode:'OBSERVABLE', observationSignals:['profile_coverage','dq_rule_coverage','critical_findings','freshness_compliance'], mappings:[gma('PRACTICES-QUALITY'),inf('Quality / accuracy'),dn('data-quality')], recommendedAction:'Baseline critical datasets and establish monitored quality thresholds.', dataNexusAction:'Profile governed datasets, recommend DQ rules, monitor findings, and verify remediation.' },
  { id:'URA-QUAL-MDM-002', dimensionId:'quality', label:'Entity consistency and master data', description:'Important business entities resolve consistently across relevant systems.', criticality:'HIGH', defaultTarget:4, evidenceMode:'CORROBORATABLE', observationSignals:['entity_match_rate','duplicate_entity_rate','master_record_coverage'], applicability:[{key:'hasMasterDataRequirement',equals:true}], mappings:[inf('Golden-record match rate'),dn('master-data-readiness')], recommendedAction:'Define authoritative entity resolution and golden-record controls where required.', dataNexusAction:'Measure entity consistency and surface duplicate or conflicting records.' },
  { id:'URA-SEM-GROUNDING-001', dimensionId:'semantics', label:'Semantic grounding', description:'Business terms and relationships are defined consistently enough for people and AI systems to interpret data correctly.', criticality:'CRITICAL', defaultTarget:4, evidenceMode:'CORROBORATABLE', observationSignals:['glossary_coverage','term_linkage_coverage','semantic_mapping_coverage'], humanPrompt:'Are authoritative business definitions routinely used when people and AI systems interpret critical data?', mappings:[inf('Context / semantic grounding'),dn('semantic-governance')], recommendedAction:'Establish authoritative terminology and link it to governed data assets.', dataNexusAction:'Map glossary terms and semantic relationships to datasets, fields, retrieval, and AI context.' },
  { id:'URA-ACCESS-SLA-001', dimensionId:'access', label:'Availability, freshness and latency', description:'Data is available within freshness and serving expectations appropriate to the use case.', criticality:'HIGH', defaultTarget:4, evidenceMode:'OBSERVABLE', observationSignals:['freshness_sla_compliance','availability_sla','p95_data_latency'], mappings:[inf('Accessibility / p95 latency vs SLA'),dn('runtime-observability')], recommendedAction:'Define and monitor use-case-specific availability, freshness, and latency objectives.', dataNexusAction:'Measure serving latency, freshness, availability, and SLA breaches.' },
  { id:'URA-GOV-POLICY-001', dimensionId:'governance', label:'Policy and access enforcement', description:'Policy, privacy, security, and access requirements are enforced before governed data is used.', criticality:'CRITICAL', defaultTarget:4, evidenceMode:'OBSERVABLE', observationSignals:['policy_coverage','access_control_coverage','sensitive_data_control_coverage','approval_coverage'], mappings:[gma('PRACTICES-POLICY'),gma('PRACTICES-SECURITY'),inf('Governance / policy coverage'),nist('GOVERN'),dn('authorization')], recommendedAction:'Close policy and authorization coverage gaps for critical assets and use cases.', dataNexusAction:'Evaluate resource access, governed approvals, privileged scopes, and auditable authorization evidence.' },
  { id:'URA-TRUST-LINEAGE-001', dimensionId:'trust', label:'End-to-end provenance and lineage', description:'Critical outputs can be traced to sources, transformations, retrieval, and downstream AI or agent use.', criticality:'CRITICAL', defaultTarget:4, evidenceMode:'OBSERVABLE', observationSignals:['dataset_lineage_coverage','field_lineage_coverage','lineage_freshness','agent_traceability'], mappings:[gma('PRACTICES-LINEAGE'),inf('Trust / lineage coverage'),nist('MAP / MEASURE'),dn('lineage')], recommendedAction:'Prioritize complete, fresh lineage and AI/agent provenance for critical use cases.', dataNexusAction:'Measure dataset, field, retrieval, and agent-action traceability and expose impact analysis.' },
  { id:'URA-AIGOV-RISK-001', dimensionId:'ai-governance', label:'AI risk and accountability', description:'AI use cases have inventory, risk context, accountable owners, evaluation evidence, and bounded authority.', criticality:'CRITICAL', defaultTarget:4, evidenceMode:'CORROBORATABLE', observationSignals:['ai_inventory_coverage','risk_classification_coverage','evaluation_evidence_coverage','approval_boundary_coverage'], applicability:[{key:'usesAi',equals:true}], mappings:[gma('AI-FRAMEWORK'),nist('GOVERN / MAP / MEASURE / MANAGE'),dn('agent-policy-v2')], recommendedAction:'Establish risk-tiered AI governance with accountable owners and evidence-backed review gates.', dataNexusAction:'Register AI capabilities, risk context, evaluation evidence, authorization, and approval boundaries.' },
  { id:'URA-OBS-DRIFT-001', dimensionId:'observability', label:'Drift and incident detection', description:'Material data, schema, model, or agent-behavior drift is detected and routed within defined objectives.', criticality:'CRITICAL', defaultTarget:4, evidenceMode:'OBSERVABLE', observationSignals:['drift_mttd','schema_drift_detection','agent_behavior_drift_detection','incident_mttr'], mappings:[inf('Observability / drift MTTD'),nist('MEASURE / MANAGE'),dn('monitoring-and-recovery')], recommendedAction:'Define monitored drift signals, detection objectives, ownership, and recovery paths.', dataNexusAction:'Continuously monitor drift and incidents, create governed findings, and verify recovery.' },
  { id:'URA-PEOPLE-LITERACY-001', dimensionId:'people', label:'Accountability, literacy and adoption', description:'People have clear governance responsibilities and sufficient data and AI literacy to operate controls.', criticality:'HIGH', defaultTarget:3, evidenceMode:'EVIDENCE_REQUIRED', observationSignals:['steward_coverage','training_freshness','role_coverage'], humanPrompt:'How consistently do accountable roles have the authority, skills, and operating practices needed to govern data and AI?', mappings:[gma('PEOPLE-LEADERSHIP'),gma('PEOPLE-STEWARDSHIP'),gma('CAPACITY-LITERACY'),dn('persona-governance')], recommendedAction:'Close accountability, stewardship, literacy, and adoption gaps for priority domains.', dataNexusAction:'Measure role coverage, surface missing accountability, and track evidence-backed improvement actions.' },
]

const capability = (
  id: string,
  dimensionId: ReadinessDimensionId,
  label: string,
  criticality: ReadinessCriticality,
  evidenceMode: EvidenceMode,
  observationSignals: readonly string[],
  recommendedAction: string,
  dataNexusAction: string,
  mappings: readonly FrameworkMapping[] = [dn('unified-readiness')],
): ReadinessCapability => ({
  id, dimensionId, label, description: label, criticality, defaultTarget: criticality === 'CONTEXTUAL' ? 3 : 4,
  evidenceMode, observationSignals, mappings, recommendedAction, dataNexusAction,
})

export const READINESS_CAPABILITY_EXTENSIONS: readonly ReadinessCapability[] = [
  capability('URA-STRAT-SPONSOR-002','strategy','Executive sponsorship and investment','HIGH','EVIDENCE_REQUIRED',['executive_sponsor','funding_commitment'],'Assign accountable executive sponsorship and sustainable investment.','Track accountable sponsorship, investment evidence, and target outcomes.'),
  capability('URA-STRAT-PORTFOLIO-003','strategy','Use-case portfolio prioritization','STANDARD','CORROBORATABLE',['use_case_portfolio','priority_reviews'],'Maintain a governed portfolio prioritized by value, risk, and feasibility.','Link use cases to owners, assets, controls, risks, and outcomes.'),
  capability('URA-STRAT-OUTCOMES-004','strategy','Outcome measurement','HIGH','OBSERVABLE',['outcome_metric_coverage','benefit_review_freshness'],'Define measurable outcomes and review realized value.','Measure outcome coverage and surface stale or missing benefit reviews.'),
  capability('URA-DISC-OWNER-002','discoverability','Ownership and stewardship coverage','CRITICAL','OBSERVABLE',['owner_coverage','steward_coverage'],'Assign accountable owners and stewards to critical assets.','Identify unowned critical assets and route ownership recommendations.'),
  capability('URA-DISC-CLASS-003','discoverability','Classification coverage','HIGH','OBSERVABLE',['classification_coverage','sensitive_classification_coverage'],'Improve classification coverage for governed and sensitive data.','Discover classification gaps and recommend governed classifications.'),
  capability('URA-DISC-SEARCH-004','discoverability','Search and retrieval success','STANDARD','OBSERVABLE',['catalog_search_success','retrieval_success'],'Measure whether users and agents can reliably find authoritative data.','Measure search and retrieval success against governed assets.'),
  capability('URA-QUAL-FRESH-003','quality','Data freshness fitness','HIGH','OBSERVABLE',['freshness_compliance','stale_dataset_rate'],'Define freshness expectations appropriate to each critical use case.','Monitor freshness and route stale critical assets for action.'),
  capability('URA-QUAL-CONSIST-004','quality','Cross-system consistency','HIGH','OBSERVABLE',['consistency_rule_coverage','consistency_findings'],'Control material consistency differences across systems.','Profile cross-system consistency and surface conflicting values.'),
  capability('URA-SEM-GLOSSARY-002','semantics','Authoritative business glossary','HIGH','CORROBORATABLE',['glossary_coverage','approved_term_coverage'],'Establish authoritative terms, definitions, and accountable owners.','Link approved terms to governed assets and owners.'),
  capability('URA-SEM-RELATION-003','semantics','Semantic relationships','STANDARD','OBSERVABLE',['semantic_relationship_coverage','ontology_link_coverage'],'Capture meaningful relationships between governed concepts and data.','Measure semantic relationship coverage and missing mappings.'),
  capability('URA-SEM-RAG-004','semantics','Retrieval context fitness','CRITICAL','OBSERVABLE',['retrieval_context_coverage','grounded_answer_rate'],'Ensure retrieval context is authoritative, relevant, and traceable.','Evaluate governed retrieval context and trace it to source assets.'),
  capability('URA-ACCESS-INTEGRATE-002','access','Integration and interoperability','HIGH','OBSERVABLE',['integration_coverage','interface_health'],'Standardize reliable governed integration paths for priority data.','Measure integration coverage and unhealthy interfaces.'),
  capability('URA-ACCESS-AUTH-003','access','Governed access success','CRITICAL','OBSERVABLE',['authorized_access_success','denied_access_auditability'],'Make legitimate access efficient without bypassing policy.','Measure authorized access outcomes and auditable denials.'),
  capability('URA-ACCESS-REALTIME-004','access','Real-time serving readiness','CONTEXTUAL','OBSERVABLE',['stream_health','real_time_sla_compliance'],'Establish monitored real-time serving objectives where required.','Monitor streaming and real-time SLA health.'),
  capability('URA-GOV-PRIVACY-002','governance','Privacy and minimization','CRITICAL','CORROBORATABLE',['privacy_control_coverage','retention_coverage'],'Apply purpose, minimization, retention, and disposal controls.','Measure privacy and retention control coverage.',[gma('PRACTICES-PRIVACY'),nist('GOVERN'),dn('privacy-governance')]),
  capability('URA-GOV-SECURITY-003','governance','Security and least privilege','CRITICAL','OBSERVABLE',['least_privilege_coverage','privileged_access_review'],'Enforce least privilege and review privileged access.','Evaluate privileged scopes and access-review evidence.',[gma('PRACTICES-SECURITY'),dn('resource-access')]),
  capability('URA-GOV-SHARING-004','governance','Sharing and third-party controls','HIGH','CORROBORATABLE',['sharing_agreement_coverage','third_party_control_coverage'],'Govern external sharing with reusable controls and obligations.','Link sharing obligations to assets, access, approvals, and audit evidence.'),
  capability('URA-TRUST-FIELD-002','trust','Field-level lineage','CRITICAL','OBSERVABLE',['field_lineage_coverage','field_lineage_freshness'],'Prioritize fresh field-level lineage for critical data.','Measure field lineage coverage and freshness.'),
  capability('URA-TRUST-RETRIEVAL-003','trust','Retrieval provenance','CRITICAL','OBSERVABLE',['retrieval_provenance_coverage','citation_trace_coverage'],'Trace retrieved context back to authoritative sources.','Persist retrieval provenance and source attribution.'),
  capability('URA-TRUST-ACTION-004','trust','Agent action provenance','CRITICAL','OBSERVABLE',['agent_action_traceability','tool_call_traceability'],'Trace governed agent actions to evidence, policy, tools, and outcomes.','Link agent executions, tool calls, approvals, evidence, and outcomes.'),
  capability('URA-AIGOV-INVENTORY-002','ai-governance','AI inventory and ownership','CRITICAL','OBSERVABLE',['ai_inventory_coverage','ai_owner_coverage'],'Maintain an accountable inventory of AI capabilities and use cases.','Register AI capabilities, owners, versions, and use contexts.'),
  capability('URA-AIGOV-EVAL-003','ai-governance','Evaluation and validation evidence','CRITICAL','OBSERVABLE',['evaluation_coverage','validation_freshness'],'Require evidence-backed evaluation before material AI use.','Track evaluation evidence, benchmarks, and release decisions.'),
  capability('URA-AIGOV-OVERSIGHT-004','ai-governance','Human oversight and authority boundaries','CRITICAL','CORROBORATABLE',['approval_boundary_coverage','human_oversight_coverage'],'Define human oversight and bounded authority for consequential actions.','Evaluate approval boundaries, delegations, and execution authority.'),
  capability('URA-OBS-DATA-002','observability','Data and schema monitoring','HIGH','OBSERVABLE',['data_monitoring_coverage','schema_drift_detection'],'Continuously monitor critical data and schema changes.','Detect material data and schema changes and route findings.'),
  capability('URA-OBS-RECOVERY-003','observability','Failure recovery and verification','CRITICAL','OBSERVABLE',['recovery_success_rate','verification_coverage'],'Use bounded recovery with durable verification evidence.','Measure recovery outcomes and post-repair verification.',[dn('execution-recovery')]),
  capability('URA-OBS-COST-004','observability','Cost and resource observability','STANDARD','OBSERVABLE',['cost_coverage','token_accounting_coverage'],'Measure resource and AI consumption against governed budgets.','Track cost, token, and resource consumption.'),
  capability('URA-PEOPLE-ROLE-002','people','Decision rights and stewardship','CRITICAL','OBSERVABLE',['role_coverage','decision_right_coverage'],'Clarify accountable decision rights across governance roles.','Measure role coverage, delegation, and decision authority.'),
  capability('URA-PEOPLE-TRAIN-003','people','Data and AI literacy','HIGH','EVIDENCE_REQUIRED',['training_coverage','training_freshness'],'Maintain role-appropriate data, governance, and AI literacy.','Track training coverage and freshness by governed persona.'),
  capability('URA-PEOPLE-ADOPT-004','people','Adoption and operating practice','STANDARD','CORROBORATABLE',['workflow_adoption','governance_participation'],'Embed governed practices into routine work and measure adoption.','Measure governed workflow adoption and participation.'),
]

export const ALL_READINESS_CAPABILITIES: readonly ReadinessCapability[] = [...READINESS_CAPABILITIES, ...READINESS_CAPABILITY_EXTENSIONS]

export function readinessCapabilityApplies(capability: ReadinessCapability, context: ReadinessContext) {
  return (capability.applicability ?? []).every(rule => {
    const value = context[rule.key]
    if (rule.includes) return Array.isArray(value) && value.includes(rule.includes)
    return value === rule.equals
  })
}

export function readinessCapabilitiesForContext(context: ReadinessContext) {
  return ALL_READINESS_CAPABILITIES.filter(capability => readinessCapabilityApplies(capability, context))
}

export function unresolvedHumanCapabilities(
  context: ReadinessContext,
  observedCapabilityIds: ReadonlySet<string>,
) {
  return readinessCapabilitiesForContext(context).filter(capability =>
    capability.evidenceMode !== 'OBSERVABLE' && !observedCapabilityIds.has(capability.id),
  )
}
