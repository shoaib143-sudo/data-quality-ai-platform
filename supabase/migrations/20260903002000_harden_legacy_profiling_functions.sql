-- The application metric engine and findings logic are now authoritative. The
-- older SQL functions must not silently create NULL metrics or placeholder
-- findings, and they must not be callable by Data API roles.

CREATE OR REPLACE FUNCTION profiling.execute_metrics(p_profile_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, profiling
AS $$
BEGIN
  RAISE EXCEPTION USING
    MESSAGE = 'profiling.execute_metrics is deprecated; execute metrics through the application profiling metric engine.',
    HINT = 'Use the execute_metrics profiling agent step or executeProfilingMetrics().';
END;
$$;

REVOKE ALL ON FUNCTION profiling.execute_metrics(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION profiling.execute_metrics(uuid) FROM anon;
REVOKE ALL ON FUNCTION profiling.execute_metrics(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION profiling.execute_metrics(uuid) TO service_role;

CREATE OR REPLACE FUNCTION profiling.generate_findings(p_profile_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, profiling
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM profiling.profile_runs
    WHERE id = p_profile_run_id
  ) THEN
    RAISE EXCEPTION 'Profiling run % was not found.', p_profile_run_id;
  END IF;

  -- Remove findings produced by the retired placeholder implementation.
  DELETE FROM profiling.profile_findings
  WHERE profile_run_id = p_profile_run_id
    AND finding_type = 'METRIC_REVIEW';

  -- Completeness: independent of sensitivity or other findings so multiple
  -- material issues can be surfaced for the same column.
  INSERT INTO profiling.profile_findings
  (
    profile_run_id,
    profile_column_id,
    finding_type,
    severity,
    title,
    description,
    confidence,
    evidence,
    recommendation
  )
  SELECT
    pm.profile_run_id,
    pm.profile_column_id,
    'COMPLETENESS',
    CASE WHEN pm.numeric_value >= 0.5 THEN 'HIGH' ELSE 'MEDIUM' END,
    pc.column_name || ' has missing values',
    round(pm.numeric_value * 100, 4)::text || '% of observed values are null or missing.',
    1,
    jsonb_build_object(
      'metric_key', pm.metric_key,
      'null_rate', round(pm.numeric_value, 4)
    ),
    jsonb_build_object(
      'action', 'review_source_completeness',
      'threshold', 0.2
    )
  FROM profiling.profile_metrics pm
  JOIN profiling.profile_columns pc ON pc.id = pm.profile_column_id
  WHERE pm.profile_run_id = p_profile_run_id
    AND pm.metric_key = 'null_rate'
    AND pm.numeric_value > 0.2
    AND NOT EXISTS (
      SELECT 1
      FROM profiling.profile_findings existing
      WHERE existing.profile_run_id = pm.profile_run_id
        AND existing.profile_column_id = pm.profile_column_id
        AND existing.finding_type = 'COMPLETENESS'
        AND existing.title = pc.column_name || ' has missing values'
    );

  -- Sensitivity: independent of completeness findings.
  INSERT INTO profiling.profile_findings
  (
    profile_run_id,
    profile_column_id,
    finding_type,
    severity,
    title,
    description,
    confidence,
    evidence,
    recommendation
  )
  SELECT
    pm.profile_run_id,
    pm.profile_column_id,
    'SENSITIVITY',
    'INFO',
    pc.column_name || ' appears sensitive',
    'Observed values match a known sensitive-data pattern.',
    round(pm.numeric_value, 4),
    jsonb_build_object(
      'metric_key', pm.metric_key,
      'sensitive_match_rate', round(pm.numeric_value, 4)
    ),
    jsonb_build_object(
      'action', 'apply_data_classification_and_access_controls'
    )
  FROM profiling.profile_metrics pm
  JOIN profiling.profile_columns pc ON pc.id = pm.profile_column_id
  WHERE pm.profile_run_id = p_profile_run_id
    AND pm.metric_key = 'sensitive_match_rate'
    AND pm.numeric_value >= 0.8
    AND NOT EXISTS (
      SELECT 1
      FROM profiling.profile_findings existing
      WHERE existing.profile_run_id = pm.profile_run_id
        AND existing.profile_column_id = pm.profile_column_id
        AND existing.finding_type = 'SENSITIVITY'
        AND existing.title = pc.column_name || ' appears sensitive'
    );

  -- Pattern validity: report material pattern mismatch without asserting a
  -- specific upstream cause.
  INSERT INTO profiling.profile_findings
  (
    profile_run_id,
    profile_column_id,
    finding_type,
    severity,
    title,
    description,
    confidence,
    evidence,
    recommendation
  )
  SELECT
    pm.profile_run_id,
    pm.profile_column_id,
    'VALIDITY',
    CASE WHEN pm.numeric_value < 0.5 THEN 'MEDIUM' ELSE 'LOW' END,
    pc.column_name || ' has pattern mismatches',
    round((1 - pm.numeric_value) * 100, 4)::text || '% of observed non-null values do not match the detected pattern.',
    1,
    jsonb_build_object(
      'metric_key', pm.metric_key,
      'pattern_match_rate', round(pm.numeric_value, 4)
    ),
    jsonb_build_object(
      'action', 'review_column_format_and_validation_rules'
    )
  FROM profiling.profile_metrics pm
  JOIN profiling.profile_columns pc ON pc.id = pm.profile_column_id
  WHERE pm.profile_run_id = p_profile_run_id
    AND pm.metric_key = 'pattern_match_rate'
    AND pm.numeric_value IS NOT NULL
    AND pm.numeric_value < 0.8
    AND NOT EXISTS (
      SELECT 1
      FROM profiling.profile_findings existing
      WHERE existing.profile_run_id = pm.profile_run_id
        AND existing.profile_column_id = pm.profile_column_id
        AND existing.finding_type = 'VALIDITY'
        AND existing.title = pc.column_name || ' has pattern mismatches'
    );

  -- Outliers: surface only when the deterministic metric engine has observed
  -- at least one numeric outlier.
  INSERT INTO profiling.profile_findings
  (
    profile_run_id,
    profile_column_id,
    finding_type,
    severity,
    title,
    description,
    confidence,
    evidence,
    recommendation
  )
  SELECT
    pm.profile_run_id,
    pm.profile_column_id,
    'OUTLIER',
    CASE WHEN COALESCE(rate.numeric_value, 0) >= 0.1 THEN 'MEDIUM' ELSE 'LOW' END,
    pc.column_name || ' contains numeric outliers',
    pm.numeric_value::text || ' numeric values are outside the deterministic IQR bounds.',
    1,
    jsonb_build_object(
      'outlier_count', pm.numeric_value,
      'outlier_rate', round(rate.numeric_value, 4),
      'min', min_metric.numeric_value,
      'max', max_metric.numeric_value,
      'mean', mean_metric.numeric_value,
      'stddev', stddev_metric.numeric_value
    ),
    jsonb_build_object(
      'action', 'review_outlier_values_and_upstream_rules'
    )
  FROM profiling.profile_metrics pm
  JOIN profiling.profile_columns pc ON pc.id = pm.profile_column_id
  LEFT JOIN profiling.profile_metrics rate
    ON rate.profile_run_id = pm.profile_run_id
   AND rate.profile_column_id = pm.profile_column_id
   AND rate.metric_key = 'outlier_rate'
  LEFT JOIN profiling.profile_metrics min_metric
    ON min_metric.profile_run_id = pm.profile_run_id
   AND min_metric.profile_column_id = pm.profile_column_id
   AND min_metric.metric_key = 'min'
  LEFT JOIN profiling.profile_metrics max_metric
    ON max_metric.profile_run_id = pm.profile_run_id
   AND max_metric.profile_column_id = pm.profile_column_id
   AND max_metric.metric_key = 'max'
  LEFT JOIN profiling.profile_metrics mean_metric
    ON mean_metric.profile_run_id = pm.profile_run_id
   AND mean_metric.profile_column_id = pm.profile_column_id
   AND mean_metric.metric_key = 'mean'
  LEFT JOIN profiling.profile_metrics stddev_metric
    ON stddev_metric.profile_run_id = pm.profile_run_id
   AND stddev_metric.profile_column_id = pm.profile_column_id
   AND stddev_metric.metric_key = 'stddev'
  WHERE pm.profile_run_id = p_profile_run_id
    AND pm.metric_key = 'outlier_count'
    AND pm.numeric_value > 0
    AND NOT EXISTS (
      SELECT 1
      FROM profiling.profile_findings existing
      WHERE existing.profile_run_id = pm.profile_run_id
        AND existing.profile_column_id = pm.profile_column_id
        AND existing.finding_type = 'OUTLIER'
        AND existing.title = pc.column_name || ' contains numeric outliers'
    );

  -- Dataset duplicate rows are a dataset-level finding. The metric engine
  -- records whether the value is based on a sample or the full dataset in the
  -- profile run summary, so the finding preserves that basis as evidence.
  INSERT INTO profiling.profile_findings
  (
    profile_run_id,
    profile_column_id,
    finding_type,
    severity,
    title,
    description,
    confidence,
    evidence,
    recommendation
  )
  SELECT
    pm.profile_run_id,
    NULL,
    'DUPLICATES',
    CASE WHEN COALESCE(rate.numeric_value, 0) >= 0.05 THEN 'MEDIUM' ELSE 'LOW' END,
    'Duplicate rows detected',
    pm.numeric_value::text || ' duplicate row occurrences were detected.',
    1,
    jsonb_build_object(
      'duplicate_row_count', pm.numeric_value,
      'duplicate_row_rate', round(rate.numeric_value, 4),
      'basis', pr.summary ->> 'duplicate_metric_basis',
      'sample_size', pr.summary -> 'duplicate_metric_sample_size',
      'denominator', pr.summary -> 'duplicate_metric_denominator'
    ),
    jsonb_build_object(
      'action', 'review_duplicate_records_and_business_key_rules'
    )
  FROM profiling.profile_metrics pm
  JOIN profiling.profile_runs pr ON pr.id = pm.profile_run_id
  LEFT JOIN profiling.profile_metrics rate
    ON rate.profile_run_id = pm.profile_run_id
   AND rate.profile_column_id IS NULL
   AND rate.metric_key = 'duplicate_row_rate'
  WHERE pm.profile_run_id = p_profile_run_id
    AND pm.profile_column_id IS NULL
    AND pm.metric_key = 'duplicate_row_count'
    AND pm.numeric_value > 0
    AND NOT EXISTS (
      SELECT 1
      FROM profiling.profile_findings existing
      WHERE existing.profile_run_id = pm.profile_run_id
        AND existing.profile_column_id IS NULL
        AND existing.finding_type = 'DUPLICATES'
        AND existing.title = 'Duplicate rows detected'
    );
END;
$$;

REVOKE ALL ON FUNCTION profiling.generate_findings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION profiling.generate_findings(uuid) FROM anon;
REVOKE ALL ON FUNCTION profiling.generate_findings(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION profiling.generate_findings(uuid) TO service_role;
