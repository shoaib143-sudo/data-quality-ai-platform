export type MetricScope = 'DATASET' | 'COLUMN'

export type DeterministicMetricDefinition = {
  metric_key: string
  scope: MetricScope
}

/**
 * Metrics currently executable by the deterministic profiling engine.
 * Database metric_definitions may contain a broader catalog, but execution
 * must only claim metrics that have a concrete deterministic implementation.
 */
export const DETERMINISTIC_METRICS: readonly DeterministicMetricDefinition[] = [
  { metric_key: 'column_count', scope: 'DATASET' },
  { metric_key: 'row_count', scope: 'DATASET' },
  { metric_key: 'non_null_count', scope: 'COLUMN' },
  { metric_key: 'null_count', scope: 'COLUMN' },
  { metric_key: 'null_rate', scope: 'COLUMN' },
  { metric_key: 'distinct_count', scope: 'COLUMN' },
  { metric_key: 'distinct_rate', scope: 'COLUMN' },
  { metric_key: 'unique_count', scope: 'COLUMN' },
  { metric_key: 'unique_rate', scope: 'COLUMN' },
  { metric_key: 'pattern_match_rate', scope: 'COLUMN' },
  { metric_key: 'sensitive_match_rate', scope: 'COLUMN' },
  { metric_key: 'candidate_key_confidence', scope: 'COLUMN' },
]

export const DETERMINISTIC_METRIC_KEYS = DETERMINISTIC_METRICS.map(({ metric_key }) => metric_key)

export function isDeterministicMetric(metricKey: string, scope: MetricScope) {
  return DETERMINISTIC_METRICS.some(
    (metric) => metric.metric_key === metricKey && metric.scope === scope,
  )
}
