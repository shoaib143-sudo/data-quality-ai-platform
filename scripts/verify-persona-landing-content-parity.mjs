import fs from 'node:fs'
import { personaSlugs, personas } from '../lib/governance/personas.ts'
import { personaAcceptanceTasks } from '../lib/governance/persona-acceptance-tasks.ts'
import { personaPresentationPolicies } from '../lib/governance/persona-presentation.ts'
import { buildRoleLandingPresentation } from '../lib/governance/persona-presentation-view.ts'

const mock = {
  confidence:.82, governedAssets:12, activeSources:4, materialFindings:3, highFindings:2,
  failedControls:1, openAlerts:2, coverage:75, affectedDomains:5, certifiedDatasets:6,
  pendingCertifications:2, pendingWaivers:1, unresolvedIssues:4, ownershipCoverage:80,
  domainAssignedCoverage:90, approvedGlossaryMappings:10, approvedClassifications:8,
  cdeMappings:5, failedControlEvaluations:1, datasets:[{approvedClassifications:1}], businessImpact:[{count:3}],
}
const landing = fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
const home = fs.readFileSync('app/home/[persona]/page.tsx','utf8')

const expected = {
 'senior-leadership':['enterprise trust','material risk','business impact','governance outcomes'],
 'business-user':['trusted governed data','known issues','glossary','certified'],
 'data-owner':['domain','quality','decision','lineage'],
 'data-product-owner':['product trust','certification','consumer impact','product issues'],
 'data-steward':['stewardship','investigation','classification','issues'],
 'data-governance-specialist':['governance','control coverage','stewardship','audit'],
 'compliance-risk-officer':['control','regulatory','exception','audit'],
 'privacy-security-officer':['sensitive','classification','privacy','lineage'],
 'data-governance-admin':['platform','source','workflow','configuration'],
 'data-custodian':['technical','source','profiling','remediation'],
 'source-system-owner':['source','defect','downstream','profiling'],
 'metadata-analyst':['metadata','glossary','classification','lineage'],
 'data-quality-analyst':['quality','dimension','failed control','root-cause'],
}

const failures=[]
for(const slug of personaSlugs){
 const persona=personas[slug]
 const policy=personaPresentationPolicies[slug]
 const view=buildRoleLandingPresentation(policy, mock)
 const corpus=[persona.strapline,persona.focus,persona.primaryQuestion,policy.objective,...policy.priorities,...persona.nav.map(x=>x.label),view.attentionTitle,view.contextTitle,view.actionTitle,...view.metrics.flatMap(x=>[x.label,x.detail]),...view.aiStarters].join(' ').toLowerCase()
 for(const term of expected[slug]) if(!corpus.includes(term)) failures.push(`${slug}: missing persona concept "${term}"`)
 const tasks=personaAcceptanceTasks[slug]
 if(tasks.length<4) failures.push(`${slug}: fewer than four real-life tasks`)
}
const structural=[
 ['Data Domain filter is wired',home.includes('requested.domain')&&home.includes('requestedDomain')&&landing.includes('name="domain"')],
 ['Data Quality Analyst gets dataset filter',landing.includes("persona.slug === 'metadata-analyst' || persona.slug === 'data-quality-analyst'")],
 ['Data Quality Analyst gets dimension filter',landing.includes("persona.slug === 'data-quality-analyst'")&&landing.includes('name="dimension"')],
 ['all personas use governed presentation engine',landing.includes('buildPersonaPresentationPlan')&&landing.includes('buildRoleLandingPresentation')],
]
for(const [name,ok] of structural) if(!ok) failures.push(name)
if(failures.length){ console.error(failures.join('\n')); process.exit(1)}
console.log('PASS persona landing content parity: 13/13 canonical personas covered')
