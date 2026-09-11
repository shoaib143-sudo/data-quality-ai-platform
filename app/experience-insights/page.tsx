import Link from 'next/link'
import { ArrowRight, BarChart3, CheckCircle2, Compass, MousePointerClick } from 'lucide-react'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { requireUser } from '@/lib/supabase/auth'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }
type EventRow = { project_id: string; event_type: string; occurred_at: string; payload: Record<string, unknown> | null }

const stages = ['CONNECT', 'DISCOVER', 'PROFILE', 'REMEDIATE', 'VERIFY', 'COMPLETE'] as const
function stageOf(event: EventRow) {
  const value = String(event.payload?.stage ?? '').toUpperCase()
  return stages.includes(value as typeof stages[number]) ? value : 'UNKNOWN'
}

export default async function ExperienceInsightsPage() {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const supabase = await createClient()

  const [projectsResult, eventsResult] = await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('orchestration').from('analytics_events')
      .select('project_id,event_type,occurred_at,payload')
      .eq('aggregate_type', 'ux_governance_journey')
      .in('event_type', ['UX_JOURNEY_VIEWED', 'UX_JOURNEY_NEXT_ACTION_SELECTED'])
      .order('occurred_at', { ascending: false })
      .limit(5000),
  ])

  if (projectsResult.error) throw new Error(`Unable to load experience projects: ${projectsResult.error.message}`)
  // analytics_events is service-only by design. If RLS hides it from the user client,
  // the workspace remains truthful and shows zero observed interactions rather than bypassing RLS.
  const projects = (projectsResult.data ?? []) as Project[]
  const events = eventsResult.error ? [] : ((eventsResult.data ?? []) as EventRow[])

  const cards = projects.map(project => {
    const rows = events.filter(event => event.project_id === project.id)
    const views = rows.filter(event => event.event_type === 'UX_JOURNEY_VIEWED')
    const actions = rows.filter(event => event.event_type === 'UX_JOURNEY_NEXT_ACTION_SELECTED')
    const latest = rows[0] ?? null
    const stageCounts = stages.map(stage => ({ stage, count: views.filter(event => stageOf(event) === stage).length }))
    const max = Math.max(1, ...stageCounts.map(item => item.count))
    return { project, views: views.length, actions: actions.length, latest, stageCounts, max }
  })

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar roleLabel={landing.persona.replaceAll('-', ' ')} contextLabel="Experience insights" />
        <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-violet-700"><BarChart3 className="h-4 w-4" /> Product evidence</div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Understand the governed journey without turning telemetry into governance truth.</h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">This workspace summarizes privacy-minimized journey interactions only. Completion, certification, remediation, and control outcomes remain derived from their authoritative domain evidence.</p>
        </header>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          {cards.map(({ project, views, actions, latest, stageCounts, max }) => (
            <article key={project.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Project</p>
                  <h2 className="mt-1 text-xl font-black">{project.name}</h2>
                </div>
                <Link href="/journeys" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Open journey <ArrowRight className="h-4 w-4" /></Link>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4"><Compass className="h-5 w-5 text-slate-500" /><p className="mt-3 text-2xl font-black">{views}</p><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Observed views</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><MousePointerClick className="h-5 w-5 text-slate-500" /><p className="mt-3 text-2xl font-black">{actions}</p><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Next actions selected</p></div>
              </div>

              <div className="mt-5 space-y-3" aria-label={`Journey view distribution for ${project.name}`}>
                {stageCounts.map(item => (
                  <div key={item.stage}>
                    <div className="flex items-center justify-between text-xs font-bold"><span>{item.stage}</span><span>{item.count}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.round((item.count / max) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs leading-5 text-slate-500">{latest ? `Latest accepted interaction: ${new Date(latest.occurred_at).toLocaleString()} · ${stageOf(latest)}` : 'No user-visible interaction evidence is available in this authorization context.'}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><h2 className="font-black text-emerald-950">Measurement boundary</h2><p className="mt-1 text-sm leading-6 text-emerald-900">Interaction counts describe accepted UX events. They do not prove that a downstream governed task succeeded. Use the guided journey, scorecards, remediation, and control evidence for outcome claims.</p></div></div>
        </section>
      </div>
    </main>
  )
}
