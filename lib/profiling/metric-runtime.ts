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

type Row = Record<string, unknown>;

const RATE_SCALE = 4;

function round(value: number, places = RATE_SCALE) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isMissing(value: unknown) {
  return value === null || value === undefined;
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function valueKey(value: unknown) {
  const normalized = normalize(value);
  if (isMissing(normalized)) return "__NULL__";
  return typeof normalized === "string"
    ? normalized
    : JSON.stringify(normalized);
}

function emailMatch(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function phoneMatch(value: unknown) {
  return typeof value === "string" && /^[+()\d\s.-]{7,}$/.test(value.trim());
}

function ssnMatch(value: unknown) {
  return typeof value === "string" && /^\d{3}-?\d{2}-?\d{4}$/.test(value.trim());
}

function patternMatch(column: string, value: unknown) {
  if (isMissing(value)) return false;
  const name = column.toLowerCase();
  if (name.includes("email")) return emailMatch(value);
  if (name.includes("phone") || name.includes("mobile")) return phoneMatch(value);
  if (name.includes("ssn") || name.includes("national_id")) return ssnMatch(value);
  return true;
}

function sensitiveMatch(column: string, value: unknown) {
  if (isMissing(value)) return false;
  const name = column.toLowerCase();
  if (name.includes("email")) return emailMatch(value);
  if (name.includes("phone") || name.includes("mobile")) return phoneMatch(value);
  if (name.includes("ssn") || name.includes("national_id")) return ssnMatch(value);
  if (name.includes("address")) return typeof value === "string" && value.trim().length >= 8;
  return false;
}

function metricValue(type: string, column: string | undefined, rows: Row[]): number | null {
  if (type === "row_count") return rows.length;
  if (!column) return null;

  const values = rows.map((row) => row[column]);
  const nonNull = values.filter((value) => !isMissing(value));
  const nullCount = values.length - nonNull.length;
  const distinctCount = new Set(nonNull.map(valueKey)).size;
  const frequencies = new Map<string, number>();

  for (const value of nonNull) {
    const key = valueKey(value);
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }

  const uniqueCount = Array.from(frequencies.values()).filter((count) => count === 1).length;
  const nullRate = values.length === 0 ? 0 : nullCount / values.length;
  const distinctRate = values.length === 0 ? 0 : distinctCount / values.length;
  const uniqueRate = nonNull.length === 0 ? 0 : uniqueCount / nonNull.length;
  const patternEligible = nonNull.length;
  const patternRate = patternEligible === 0
    ? 0
    : nonNull.filter((value) => patternMatch(column, value)).length / patternEligible;
  const sensitiveRate = patternEligible === 0
    ? 0
    : nonNull.filter((value) => sensitiveMatch(column, value)).length / patternEligible;

  switch (type) {
    case "column_count":
      return 1;
    case "non_null_count":
      return nonNull.length;
    case "null_count":
      return nullCount;
    case "null_rate":
      return round(nullRate);
    case "distinct_count":
      return distinctCount;
    case "distinct_rate":
    case "distinct_percentage":
      return round(type === "distinct_percentage" ? distinctRate * 100 : distinctRate);
    case "unique_count":
      return uniqueCount;
    case "unique_rate":
      return round(uniqueRate);
    case "pattern_match_rate":
      return round(patternRate);
    case "sensitive_match_rate":
      return round(sensitiveRate);
    case "candidate_key_confidence":
      return round(uniqueRate * (1 - nullRate));
    default:
      return null;
  }
}

/**
 * Deterministic generic metric runtime used by profiling tool handlers.
 * Dataset-specific source loading belongs to the source adapter and is not
 * performed here. This runtime operates only on already-resolved rows.
 */
export async function executeMetrics(
  definitions: MetricDefinition[],
  rows: Record<string, unknown>[]
): Promise<MetricExecutionResult[]> {
  return definitions.map((metric) => {
    try {
      const supported = new Set([
        "row_count",
        "column_count",
        "non_null_count",
        "null_count",
        "null_rate",
        "distinct_count",
        "distinct_rate",
        "distinct_percentage",
        "unique_count",
        "unique_rate",
        "pattern_match_rate",
        "sensitive_match_rate",
        "candidate_key_confidence",
      ]);

      if (!supported.has(metric.type)) {
        return {
          metric_definition_id: metric.id,
          metric_name: metric.name,
          value: null,
          status: "FAILED",
          error: `Unsupported metric type: ${metric.type}`,
        };
      }

      if (metric.type !== "row_count" && !metric.column) {
        return {
          metric_definition_id: metric.id,
          metric_name: metric.name,
          value: null,
          status: "FAILED",
          error: "Metric column is required",
        };
      }

      return {
        metric_definition_id: metric.id,
        metric_name: metric.name,
        value: metricValue(metric.type, metric.column, rows),
        status: "COMPLETED",
      };
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
