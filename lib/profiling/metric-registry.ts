export type MetricScope = 'DATASET' | 'COLUMN' | 'DISTRIBUTION'

export type DeterministicMetricDefinition = {
  metric_key: string
  scope: MetricScope
}

/**
 * Metrics with concrete deterministic implementations in the profiling engine.
 * The database catalog remains the source of truth for what is enabled.
 */
export const DETERMINISTIC_METRICS: readonly DeterministicMetricDefinition[] = [
  { metric_key: 'column_count', scope: 'DATASET' },
  { metric_key: 'duplicate_row_count', scope: 'DATASET' },
  { metric_key: 'duplicate_row_rate', scope: 'DATASET' },
  { metric_key: 'row_count', scope: 'DATASET' },
  { metric_key: 'schema_hash', scope: 'DATASET' },
  { metric_key: 'candidate_key_confidence', scope: 'COLUMN' },
  { metric_key: 'distinct_count', scope: 'COLUMN' },
  { metric_key: 'distinct_rate', scope: 'COLUMN' },
  { metric_key: 'empty_string_count', scope: 'COLUMN' },
  { metric_key: 'length_max', scope: 'COLUMN' },
  { metric_key: 'length_mean', scope: 'COLUMN' },
  { metric_key: 'length_min', scope: 'COLUMN' },
  { metric_key: 'max', scope: 'COLUMN' },
  { metric_key: 'mean', scope: 'COLUMN' },
  { metric_key: 'median', scope: 'COLUMN' },
  { metric_key: 'min', scope: 'COLUMN' },
  { metric_key: 'negative_count', scope: 'COLUMN' },
  { metric_key: 'non_null_count', scope: 'COLUMN' },
  { metric_key: 'null_count', scope: 'COLUMN' },
  { metric_key: 'null_rate', scope: 'COLUMN' },
  { metric_key: 'outlier_count', scope: 'COLUMN' },
  { metric_key: 'outlier_rate', scope: 'COLUMN' },
  { metric_key: 'pattern_count', scope: 'COLUMN' },
  { metric_key: 'pattern_match_rate', scope: 'COLUMN' },
  { metric_key: 'sensitive_match_rate', scope: 'COLUMN' },
  { metric_key: 'stddev', scope: 'COLUMN' },
  { metric_key: 'unique_count', scope: 'COLUMN' },
  { metric_key: 'unique_rate', scope: 'COLUMN' },
  { metric_key: 'whitespace_only_count', scope: 'COLUMN' },
  { metric_key: 'zero_count', scope: 'COLUMN' },
  { metric_key: 'histogram', scope: 'DISTRIBUTION' },
  { metric_key: 'quantiles', scope: 'DISTRIBUTION' },
  { metric_key: 'top_values', scope: 'DISTRIBUTION' },
]

export const DETERMINISTIC_METRIC_KEYS = DETERMINISTIC_METRICS.map(({ metric_key }) => metric_key)

export function isDeterministicMetric(metricKey: string, scope: MetricScope) {
  return DETERMINISTIC_METRICS.some(
    (metric) => metric.metric_key === metricKey && metric.scope === scope,
  )
}

export function unsupportedMetricDefinitions(
  definitions: readonly DeterministicMetricDefinition[],
) {
  return definitions.filter(
    (definition) => !isDeterministicMetric(definition.metric_key, definition.scope),
  )
}
