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

        const { error } = await supabase
          .schema("profiling")
          .from("profile_metrics")
          .insert(metrics)

        if (error) {
          throw error
        }

        const findings = results
          .filter((result) => result.status === "FAILED")
          .map((result) => ({
            profile_run_id: profileRunId,
            finding_type: "METRIC_EXECUTION",
            severity: "MEDIUM",
            title: `Metric execution failed: ${result.metric_name}`,
            description: result.error ?? "Metric execution failed",
            confidence: 0.8,
            evidence: {
              metric_definition_id: result.metric_definition_id,
            },
          }))

        if (findings.length > 0) {
          const { error: findingError } = await supabase
            .schema("profiling")
            .from("profile_findings")
            .insert(findings)

          if (findingError) {
            throw findingError
          }
        }

        const failedCount = results.filter((result) => result.status === "FAILED").length
        const overallScore = results.length === 0
          ? 0
          : Number((((results.length - failedCount) / results.length) * 100).toFixed(2))

        const { error: scoreError } = await supabase
          .schema("profiling")
          .from("data_quality_scores")
          .upsert({
            profile_run_id: profileRunId,
            completeness_score: overallScore,
            overall_score: overallScore,
          })

        if (scoreError) {
          throw scoreError
        }
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
    }

    default:
      throw new Error(`Unsupported operation ${operation}`)
  }
}
