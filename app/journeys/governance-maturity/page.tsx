import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { GovernanceMaturityOnboarding } from '@/components/governance/maturity-onboarding'
import { UnifiedReadinessSummary } from '@/components/governance/unified-readiness-summary'
import { buildUnifiedReadinessProjection } from '@/lib/governance/unified-readiness-service'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { loadLatestMaturityAssessment } from '@/lib/governance/maturity-service'
import { requireUser } from '@/lib/supabase/auth'

export default async function GovernanceMaturityPage() {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const initial = await loadLatestMaturityAssessment(user.id)
  const unified = buildUnifiedReadinessProjection({ ...initial.profile, useCases: initial.profile.usesAi ? ['GENERATIVE_AI'] : [] }, [])

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar
          persona={landing.persona}
          organizationRole={landing.organizationRole}
          roleLabel="Governance maturity"
          contextLabel="Organization readiness assessment"
          homeHref="/home"
        />
        <div className="mt-5"><UnifiedReadinessSummary capabilities={unified.capabilities} results={unified.readiness.capabilities} questionCount={unified.questions.length} /></div>
        <GovernanceMaturityOnboarding initial={initial} persona={landing.persona} organizationRole={landing.organizationRole} />
      </div>
    </main>
  )
}
