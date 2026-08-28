import { NextResponse } from 'next/server'

import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import type { ToolExecutionContext } from '@/lib/agents/types'
import { requireUser } from '@/lib/supabase/auth'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    await requireUser()

    const body = await request.json()

    const {
      operation,
      input = {},
      agentRunId,
      stepId,
      projectId,
      agentDefinitionId,
      agentVersion,
    } = body

    if (!operation) {
      return NextResponse.json(
        { error: 'operation is required' },
        { status: 400 },
      )
    }

    if (
      typeof agentRunId !== 'string' ||
      typeof stepId !== 'string' ||
      typeof projectId !== 'string' ||
      typeof agentDefinitionId !== 'string' ||
      typeof agentVersion !== 'string'
    ) {
      return NextResponse.json(
        {
          error:
            'agentRunId, stepId, projectId, agentDefinitionId and agentVersion are required',
        },
        { status: 400 },
      )
    }

    const context: ToolExecutionContext = {
      agentRunId,
      stepId,
      projectId,
      agentDefinitionId,
      agentVersion,
    }

    const result = await executeProfilingExecutor(
      operation,
      input,
      context,
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('PROFILING_EXECUTION_ERROR', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
