import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject } from '@/lib/auth/authorize'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const anchorType = (url.searchParams.get('anchorType') ?? '').trim().toUpperCase()
    const anchorKey = (url.searchParams.get('anchorKey') ?? '').trim()
    const direction = (url.searchParams.get('direction') ?? 'BOTH').trim().toUpperCase()
    const depth = Math.max(1, Math.min(8, Number(url.searchParams.get('depth') ?? 4) || 4))
    const maxEdges = Math.max(1, Math.min(400, Number(url.searchParams.get('maxEdges') ?? 200) || 200))

    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    if (!anchorType) return NextResponse.json({ error: 'anchorType is required' }, { status: 400 })
    if (!anchorKey) return NextResponse.json({ error: 'anchorKey is required' }, { status: 400 })
    if (!['UPSTREAM', 'DOWNSTREAM', 'BOTH'].includes(direction)) {
      return NextResponse.json({ error: 'direction must be UPSTREAM, DOWNSTREAM, or BOTH' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'lineage.read')
    const supabase = await createClient()
    const { data, error } = await supabase.schema('governance').rpc('traverse_knowledge_graph', {
      p_project_id: projectId,
      p_anchor_type: anchorType,
      p_anchor_key: anchorKey,
      p_direction: direction,
      p_max_depth: depth,
      p_max_edges: maxEdges,
    })
    if (error) throw new Error(`Knowledge graph traversal failed: ${error.message}`)

    const edges = data ?? []
    const nodes = new Map<string, { type: string; key: string }>()
    nodes.set(`${anchorType}:${anchorKey}`, { type: anchorType, key: anchorKey })
    for (const edge of edges) {
      nodes.set(`${edge.source_type}:${edge.source_key}`, { type: edge.source_type, key: edge.source_key })
      nodes.set(`${edge.target_type}:${edge.target_key}`, { type: edge.target_type, key: edge.target_key })
    }

    return NextResponse.json({
      projectId,
      anchor: { type: anchorType, key: anchorKey },
      direction,
      requestedDepth: depth,
      maxEdges,
      nodeCount: nodes.size,
      edgeCount: edges.length,
      nodes: [...nodes.values()],
      edges,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to traverse governance knowledge graph'
    const status = /not authorized|forbidden|capability/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
