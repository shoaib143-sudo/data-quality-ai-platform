import { planGovernedSkills, type GovernedSkillPlan } from './governed-skill-planner'
import { GOVERNED_AGENT_KEYS, type GovernedAgentKey } from './governed-agent-registry'

function governedAgentKey(value: string): GovernedAgentKey {
  if (!(GOVERNED_AGENT_KEYS as readonly string[]).includes(value)) {
    throw new Error(`Unknown governed agent key: ${value}`)
  }
  return value as GovernedAgentKey
}

export function enrichGovernedOutputWithSkillPlan(input: {
  agentKey: string
  objective: string
  output: Record<string, unknown>
}): Record<string, unknown> {
  if (input.output.skillPlan && typeof input.output.skillPlan === 'object') return input.output
  const objective = input.objective.trim()
  if (!objective) return input.output

  const agentKey = governedAgentKey(input.agentKey)
  const skillPlan: GovernedSkillPlan = planGovernedSkills({
    agentKey,
    objective,
    allowMutatingSkills: false,
  })

  return {
    ...input.output,
    skillPlan: {
      ...skillPlan,
      executionPolicy: {
        planIsAdvisory: true,
        autoExecuteAdditionalSkills: false,
        mutationSkillsAllowed: false,
        freshAuthorizationRequiredBeforeAnyAdditionalExecution: true,
      },
    },
  }
}
