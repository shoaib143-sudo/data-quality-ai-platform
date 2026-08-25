import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { executeProfilingExecutor } from "@/lib/agents/executors/profiling-executor"


export async function POST(
  request: Request
) {

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )


  const raw = await request.text()

  console.log("RAW BODY:", raw)

  const body = JSON.parse(raw)


  const {
    project_id,
    dataset_id,
    dataset_version_id
  } = body



  //
  // Create agent run
  //

  const { data: agentRun, error } =
    await supabase
      .schema("agent")
      .from("agent_runs")
      .insert({

        agent_definition_id:
          body.agent_definition_id,

        project_id,

        dataset_id,

        dataset_version_id,

        status:
          "RUNNING",

        input:
          body

      })
      .select()
      .single()



  if (error) {

    console.error(
      "AGENT RUN ERROR:",
      error
    )

    return NextResponse.json(
      {
        error: error.message
      },
      {
        status: 500
      }
    )
  }



  //
  // Create step
  //

  const { data: step, error: stepError } =
    await supabase
      .schema("agent")
      .from("agent_run_steps")
      .insert({

        agent_run_id:
          agentRun.id,

        step_name:
          "profile_dataset",

        step_order:
          1,

        status:
          "RUNNING",

        input:
          body,

        started_at:
          new Date().toISOString()

      })
      .select()
      .single()



  if (stepError) {

    console.error(
      "STEP ERROR:",
      stepError
    )

    return NextResponse.json(
      {
        error: stepError.message
      },
      {
        status: 500
      }
    )
  }




  let result


  try {

    result =
      await executeProfilingExecutor(
        "profile_dataset",
        body,
        {
          agentRunId:
            agentRun.id,

          stepId:
            step.id,

          projectId:
            project_id
        }
      )

  } catch (error) {

    console.error(
      "EXECUTOR ERROR:",
      error
    )

    return NextResponse.json(
      {
        error:
          String(error)
      },
      {
        status:500
      }
    )
  }




  await supabase
    .schema("agent")
    .from("agent_run_steps")
    .update({

      status:
        "COMPLETED",

      output:
        result.output,

      completed_at:
        new Date().toISOString()

    })
    .eq(
      "id",
      step.id
    )




  return NextResponse.json({

    agent_run_id:
      agentRun.id,

    result

  })

}