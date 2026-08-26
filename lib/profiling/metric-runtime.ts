export type MetricDefinition = {
  id: string;
  name: string;
  type: string;
  column?: string;
};

export type MetricExecutionResult = {
  metric_definition_id: string;
  metric_name: string;
  value: number | string | boolean | null;
  status: "COMPLETED" | "FAILED";
  error?: string;
};

/**
 * MVP metric runtime.
 *
 * This is intentionally small and deterministic. It provides the execution
 * boundary for profiling metrics before adding additional handlers.
 */
export async function executeMetrics(
  definitions: MetricDefinition[],
  rows: Record<string, unknown>[]
): Promise<MetricExecutionResult[]> {
  return definitions.map((metric) => {
    try {
      switch (metric.type) {
        case "row_count":
          return {
            metric_definition_id: metric.id,
            metric_name: metric.name,
            value: rows.length,
            status: "COMPLETED",
          };

        case "null_count": {
          const column = metric.column;
          const value = column
            ? rows.filter((row) => row[column] === null || row[column] === undefined).length
            : null;

          return {
            metric_definition_id: metric.id,
            metric_name: metric.name,
            value,
            status: column ? "COMPLETED" : "FAILED",
            ...(column ? {} : { error: "Metric column is required" }),
          };
        }

        default:
          return {
            metric_definition_id: metric.id,
            metric_name: metric.name,
            value: null,
            status: "FAILED",
            error: `Unsupported metric type: ${metric.type}`,
          };
      }
    } catch (error) {
      return {
        metric_definition_id: metric.id,
        metric_name: metric.name,
        value: null,
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown metric error",
      };
    }
  });
}
