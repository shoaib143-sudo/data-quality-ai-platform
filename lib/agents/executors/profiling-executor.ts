import { createClient } from "@supabase/supabase-js"
import type {
  ToolExecutionContext,
  ToolExecutionResult,
} from "../types"
import { executeMetrics, type MetricDefinition } from "../../profiling/metric-runtime"

export async function executeProfilingExecutor(
  operation: string,
  input: any,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  const { agentRunId, stepId, projectId } = context

  switch (operation) {
    case "profile_dataset": {
      const definitions = (input.metricDefinitions ?? []) as MetricDefinition[]
      const rows = (input.rows ?? []) as Record<string, unknown>[]
      const profileRunId = input.profileRunId as string | undefined

      try {
        const results = await executeMetrics(definitions, rows)

        if (profileRunId) {
          const metrics = results.map((result) => ({
            profile_run_id: profileRunId,
            metric_definition_id: result.metric_definition_id,
            metric_key: result.metric_name,
            ...(typeof result.value === "number"
              ? { numeric_value: result.value }
              : typeof result.value === "boolean"
                ? { boolean_value: result.value }
                : typeof result.value === "string"
                  ? { text_value: result.value }
                  : { json_value: { value: result.value } }),
          }))

          const findings = results
            .filter((result) => result.status === "FAILED")
            .map((result) => ({
              profile_run_id: profileRunId,
              finding_type: "METRIC_EXECUTION",
              severity: "MEDIUM",
              title: `Metric execution failed: ${result.metric_name}`,
              description: result.error ?? "Metric execution failed",
              confidence: 0.8,
              evidence: { metric_definition_id: result.metric_definition_id },
            }))

          const failedCount = results.filter((result) => result.status === "FAILED").length
          const overallScore = results.length === 0
            ? 0
            : Number((((results.length - failedCount) / results.length) * 100).toFixed(2))

          const { error } = await supabase
            .schema("profiling")
            .rpc("persist_profile_execution_result", {
              p_profile_run_id: profileRunId,
              p_metrics: metrics,
              p_findings: findings,
              p_quality_scores: {
                completeness_score: overallScore,
                overall_score: overallScore,
              },
              p_run_status: "COMPLETED",
            })

          if (error) throw error
        }

        return {
          output: {
            profile_step_id: stepId,
            agent_run_id: agentRunId,
            project_id: projectId,
            status: "COMPLETED",
            metrics: results,
          },
        }
      } catch (error) {
        if (profileRunId) {
          await supabase
            .schema("profiling")
            .from("profile_runs")
            .update({
              status: "FAILED",
              completed_at: new Date().toISOString(),
            })
            .eq("id", profileRunId)
        }

        throw error
      }
    }

    default:
      throw new Error(`Unsupported operation ${operation}`)
  }
}
