import type { GovernanceOutcomeReport } from '@/lib/orchestration/governance-outcome-report'

function sentence(value: unknown, max = 700) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function buildExecutiveNarrationScript(report: GovernanceOutcomeReport) {
  const sections: string[] = []
  sections.push(sentence(report.openingSummary))

  const measuredScores = Object.values(report.scores).filter(score => score.value !== null && score.status !== 'NOT_MEASURED')
  if (measuredScores.length) {
    sections.push(`Measured governance indicators: ${measuredScores.map(score => `${score.label} ${score.value?.toFixed(2)} out of 100`).join('; ')}.`)
  } else {
    sections.push('No governed overall or dimension score is being narrated because the required measured evidence or governed aggregation policy is not available.')
  }

  if (report.mostImportantRisk) {
    sections.push(`Highest-priority evidenced risk: ${sentence(report.mostImportantRisk.title, 240)}. ${sentence(report.mostImportantRisk.businessMeaning ?? '', 500)}`)
  } else {
    sections.push('No unresolved evidenced risk is currently ranked as the highest priority.')
  }

  if (report.businessImpact.length) {
    sections.push(`Evidence-backed business impact: ${report.businessImpact.slice(0, 4).map(claim => sentence(claim.statement, 240)).join('; ')}.`)
  } else {
    sections.push('Business impact is not claimed for this run because no governed measured or model-derived impact evidence was persisted.')
  }

  const activity = report.autonomousActivity
  sections.push(`${activity.totalAgentTasks} agent tasks were recorded, ${activity.autonomousActions} autonomous actions were recorded, ${activity.humanInterventions} human interventions were recorded, and ${activity.changesRevalidated} changes were revalidated.`)
  sections.push(sentence(report.unresolvedStatement))
  sections.push(sentence(report.assuranceStatement))
  sections.push(`This briefing is generated from DataNexus report schema ${report.schemaVersion} with ${report.evidenceRefs.length} canonical evidence references. Statements not supported by governed evidence are intentionally omitted or described as not measured.`)

  return sections.filter(Boolean).join('\n\n')
}
