import { NextResponse } from 'next/server'
import { AuthorizationError } from '@/lib/auth/authorize'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createGovernanceIntelligentRouter } from '@/lib/ai/governance-intelligent-router'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { personaAcceptanceTasks } from '@/lib/governance/persona-acceptance-tasks'
import { personas } from '@/lib/governance/personas'
import { createClient } from '@/lib/supabase/server'

type ConversationItem = { role: 'user' | 'assistant'; content: string }

function text(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function history(value: unknown): ConversationItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(-8).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const role = (item as { role?: unknown }).role
    const content = text((item as { content?: unknown }).content, 1800)
    if ((role !== 'user' && role !== 'assistant') || !content) return []
    return [{ role, content }]
  })
}

function safePath(value: unknown) {
  const raw = text(value, 1000)
  if (!raw.startsWith('/')) return '/home'
  try {
    const url = new URL(raw, 'https://datanexus.local')
    return `${url.pathname}${url.search}`
  } catch {
    return '/home'
  }
}


function workspaceForPath(path: string) {
  const pathname = new URL(path, 'https://datanexus.local').pathname
  if (pathname.startsWith('/catalog')) return 'Data Catalog'
  if (pathname.startsWith('/data-quality') || pathname.startsWith('/profiling')) return 'Data Quality'
  if (pathname.startsWith('/lineage')) return 'Lineage'
  if (pathname.startsWith('/monitoring') || pathname.startsWith('/observability')) return 'Operations'
  if (pathname.startsWith('/approvals') || pathname.startsWith('/stewardship')) return 'Governance Decisions'
  if (pathname.startsWith('/agents')) return 'Automation'
  if (pathname.startsWith('/admin')) return 'Administration'
  if (pathname.startsWith('/reports')) return 'Reports'
  return 'Governance Home'
}

export async function GET() {
  try {
    const user = await requireApiUser()
    const access = await resolveLandingAccess(user.id)
    const persona = personas[access.persona]
    const tasks = personaAcceptanceTasks[access.persona]
    return NextResponse.json({
      persona: persona.title,
      primaryQuestion: persona.primaryQuestion,
      starters: [
        persona.primaryQuestion,
        ...tasks.slice(0, 2).map(task => `Help me ${task.label.toLowerCase()}.`),
      ],
    }, {
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to resolve DataNexus AI persona context.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const question = text(body.question)
    if (!question) return NextResponse.json({ error: 'question is required.' }, { status: 400 })

    const path = safePath(body.path)
    const prior = history(body.history)
    const workspace = workspaceForPath(path)
    const access = await resolveLandingAccess(user.id)
    const persona = personas[access.persona]
    const tasks = personaAcceptanceTasks[access.persona]
    const supabase = await createClient()

    const [datasetsResult, issuesResult, projectsResult] = await Promise.all([
      supabase.schema('catalog').from('datasets')
        .select('id,name,business_domain,project_id')
        .order('name')
        .limit(100),
      supabase.schema('governance').from('issues')
        .select('id,dataset_id,title,severity,status,updated_at')
        .order('updated_at', { ascending: false })
        .limit(80),
      supabase.schema('app').from('projects')
        .select('id,name')
        .order('name')
        .limit(100),
    ])
    const evidenceAvailability = {
      catalog: datasetsResult.error ? 'UNAVAILABLE' : 'AVAILABLE',
      issues: issuesResult.error ? 'UNAVAILABLE' : 'AVAILABLE',
      projects: projectsResult.error ? 'UNAVAILABLE' : 'AVAILABLE',
    }

    const visibleDatasets = datasetsResult.error ? [] : (datasetsResult.data ?? [])
    const visibleProjects = projectsResult.error ? [] : (projectsResult.data ?? [])
    const visibleDatasetIds = new Set(visibleDatasets.map(item => String(item.id)))
    const url = new URL(path, 'https://datanexus.local')
    const requestedProjectId = text(url.searchParams.get('projectId'), 100)
    const selectedProjectId = requestedProjectId && visibleProjects.some(project => String(project.id) === requestedProjectId)
      ? requestedProjectId
      : null
    const projectDatasets = selectedProjectId
      ? visibleDatasets.filter(item => String(item.project_id) === selectedProjectId)
      : visibleDatasets
    const requestedDomain = text(url.searchParams.get('domain'), 200)
    const selectedDomain = requestedDomain && requestedDomain !== 'overall' && projectDatasets.some(item => (item.business_domain || 'Unassigned') === requestedDomain)
      ? requestedDomain
      : null
    const requestedDatasetId = text(url.searchParams.get('datasetId'), 100)
    const selectedDataset = requestedDatasetId
      ? projectDatasets.find(item => String(item.id) === requestedDatasetId && (!selectedDomain || (item.business_domain || 'Unassigned') === selectedDomain))
      : null
    const scopedDatasets = selectedDataset
      ? [selectedDataset]
      : selectedDomain
        ? projectDatasets.filter(item => (item.business_domain || 'Unassigned') === selectedDomain)
        : projectDatasets
    const scopedDatasetIds = new Set(scopedDatasets.map(item => String(item.id)))
    const visibleIssues = (issuesResult.error ? [] : (issuesResult.data ?? [])).filter(issue => !issue.dataset_id || visibleDatasetIds.has(String(issue.dataset_id)))
    const scopedIssues = selectedDomain || selectedDataset
      ? visibleIssues.filter(issue => issue.dataset_id && scopedDatasetIds.has(String(issue.dataset_id)))
      : visibleIssues
    const unresolvedIssues = scopedIssues.filter(issue => !['RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(String(issue.status).toUpperCase()))

    const projectId = selectedProjectId
      ?? (selectedDataset ? String(selectedDataset.project_id) : null)
      ?? (scopedDatasets[0] ? String(scopedDatasets[0].project_id) : null)
      ?? (visibleProjects[0] ? String(visibleProjects[0].id) : null)
    if (!projectId) {
      return NextResponse.json({
        error: 'No governed project context is available for DataNexus AI.',
        code: 'AI_PROJECT_CONTEXT_UNAVAILABLE',
      }, { status: 503 })
    }

    const router = createGovernanceIntelligentRouter()
    const decision = await router.route({
      projectId,
      task: 'governance_reasoning',
      sensitivity: 'INTERNAL',
      risk: 'LOW',
      executionCorrelationId: crypto.randomUUID(),
    })
    if (!decision.provider) {
      return NextResponse.json({
        error: 'No governed reasoning route is currently available for DataNexus AI.',
        code: 'AI_PROVIDER_UNAVAILABLE',
        reason: decision.reason,
      }, { status: 503 })
    }

    const result = await decision.provider.generateJson({
      task: 'governance_reasoning',
      temperature: 0.1,
      maxOutputTokens: 700,
      system: [
        `You are the DataNexus AI copilot for the ${persona.title} persona.`,
        `Primary focus: ${persona.focus}.`,
        `Primary question: ${persona.primaryQuestion}`,
        'Answer using only the governed context supplied in the input. Never invent counts, classifications, certifications, incidents, controls, regulatory conclusions, or business impact.',
        'When evidence is insufficient, say what is unavailable and point the user to the most relevant governed workspace.',
        'Do not claim governance approval, remediation completion, certification, compliance, or authority unless the supplied evidence proves it.',
        'Use business language for business personas and technical language only for technical/analytical personas.',
        'Return JSON with keys: answer (string), suggestedFollowUps (array of up to 3 strings), sourceRoutes (array of up to 4 routes chosen only from the supplied allowedRoutes).',
      ].join('\n'),
      input: {
        question,
        conversation: prior,
        currentPath: path,
        currentWorkspace: workspace,
        selectedScope: {
          dataDomain: selectedDomain ?? 'All Data Domains',
          dataset: selectedDataset ? { id: selectedDataset.id, name: selectedDataset.name } : null,
        },
        governedContext: {
          evidenceAvailability,
          visibleDatasetCount: scopedDatasets.length,
          dataDomains: [...new Set(scopedDatasets.map(item => item.business_domain || 'Unassigned'))].slice(0, 20),
          datasets: scopedDatasets.slice(0, 25).map(item => ({ id: item.id, name: item.name, dataDomain: item.business_domain || 'Unassigned' })),
          unresolvedIssueCount: unresolvedIssues.length,
          unresolvedIssues: unresolvedIssues.slice(0, 12).map(issue => ({
            id: issue.id,
            title: issue.title,
            severity: issue.severity,
            status: issue.status,
          })),
        },
        personaTasks: tasks.map(task => ({ label: task.label, route: task.route, mode: task.mode })),
        allowedRoutes: persona.nav.map(item => item.href),
      },
    })

    const answer = text(result.result.answer, 6000)
    const suggestedFollowUps = Array.isArray(result.result.suggestedFollowUps)
      ? result.result.suggestedFollowUps.map(item => text(item, 300)).filter(Boolean).slice(0, 3)
      : []
    const allowedRoutes = new Set(persona.nav.map(item => item.href))
    const sourceRoutes = Array.isArray(result.result.sourceRoutes)
      ? result.result.sourceRoutes.map(item => text(item, 500)).filter(route => allowedRoutes.has(route)).slice(0, 4)
      : []

    if (!answer) throw new Error('DataNexus AI returned no answer.')

    return NextResponse.json({
      answer,
      suggestedFollowUps,
      sourceRoutes,
      persona: persona.title,
      scope: selectedDataset?.name ?? selectedDomain ?? 'All Data Domains',
      workspace,
      provider: result.provider,
      model: result.model,
    }, {
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to answer with DataNexus AI.' }, { status: 500 })
  }
}
