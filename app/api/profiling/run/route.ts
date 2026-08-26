import { NextResponse } from "next/server"

import { executeProfilingExecutor } from "@/lib/agents/executors/profiling-executor"
import type {
  ToolExecutionContext,
} from "@/lib/agents/types"


export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      operation,
      input = {},
      agentRunId,
      stepId,
      projectId,
    } = body


    if (!operation) {
      return NextResponse.json(
        {
          error: "operation is required",
        },
        {
          status: 400,
        }
      )
    }


    const context: ToolExecutionContext = {
      agentRunId,
      stepId,
      projectId,
    }


    const result = await executeProfilingExecutor(
      operation,
      input,
      context
    )


    return NextResponse.json(result)

  } catch (error) {

    console.error(
      "PROFILING_EXECUTION_ERROR",
      error,
    )

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",

        stack:
          error instanceof Error
            ? error.stack
            : null,
      },
      {
        status: 500,
      }
    )

}
}