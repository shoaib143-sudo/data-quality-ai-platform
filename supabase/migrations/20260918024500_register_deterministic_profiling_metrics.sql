begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Keep the database metric catalog aligned with the deterministic runtime
-- registry. The executor only persists enabled catalog entries, so every
-- production-supported deterministic metric must have an enabled definition.
insert into profiling.metric_definitions (
  metric_key,
  name,
  scope,
  value_type,
  description,
  enabled
)
values
  ('column_count', 'Column Count', 'DATASET', 'NUMBER', 'Number of columns observed for the dataset.', true),
  ('duplicate_row_count', 'Duplicate Row Count', 'DATASET', 'NUMBER', 'Number of duplicate rows beyond the first occurrence.', true),
  ('duplicate_row_rate', 'Duplicate Row Rate', 'DATASET', 'NUMBER', 'Fraction of observed rows that are duplicates beyond the first occurrence.', true),
  ('row_count', 'Row Count', 'DATASET', 'NUMBER', 'Number of source rows represented by the profiling execution.', true),
  ('schema_hash', 'Schema Hash', 'DATASET', 'STRING', 'Stable hash representing the normalized dataset schema.', true),
  ('candidate_key_confidence', 'Candidate Key Confidence', 'COLUMN', 'NUMBER', 'Confidence that a column uniquely identifies rows.', true),
  ('distinct_count', 'Distinct Count', 'COLUMN', 'NUMBER', 'Number of distinct non-null values.', true),
  ('distinct_rate', 'Distinct Rate', 'COLUMN', 'NUMBER', 'Fraction of non-null values that are distinct.', true),
  ('empty_string_count', 'Empty String Count', 'COLUMN', 'NUMBER', 'Number of exact empty-string values.', true),
  ('length_max', 'Maximum Length', 'COLUMN', 'NUMBER', 'Maximum observed string length.', true),
  ('length_mean', 'Mean Length', 'COLUMN', 'NUMBER', 'Mean observed string length.', true),
  ('length_min', 'Minimum Length', 'COLUMN', 'NUMBER', 'Minimum observed string length.', true),
  ('max', 'Maximum', 'COLUMN', 'NUMBER', 'Maximum observed numeric value.', true),
  ('mean', 'Mean', 'COLUMN', 'NUMBER', 'Mean observed numeric value.', true),
  ('median', 'Median', 'COLUMN', 'NUMBER', 'Median observed numeric value.', true),
  ('min', 'Minimum', 'COLUMN', 'NUMBER', 'Minimum observed numeric value.', true),
  ('negative_count', 'Negative Count', 'COLUMN', 'NUMBER', 'Number of negative numeric observations.', true),
  ('non_null_count', 'Non-null Count', 'COLUMN', 'NUMBER', 'Number of non-null observations.', true),
  ('null_count', 'Null Count', 'COLUMN', 'NUMBER', 'Number of null observations.', true),
  ('null_rate', 'Null Rate', 'COLUMN', 'NUMBER', 'Fraction of observed rows that are null.', true),
  ('outlier_count', 'Outlier Count', 'COLUMN', 'NUMBER', 'Number of observations classified as statistical outliers.', true),
  ('outlier_rate', 'Outlier Rate', 'COLUMN', 'NUMBER', 'Fraction of numeric observations classified as statistical outliers.', true),
  ('pattern_count', 'Pattern Count', 'COLUMN', 'NUMBER', 'Number of observations matching the deterministic column pattern detector.', true),
  ('pattern_match_rate', 'Pattern Match Rate', 'COLUMN', 'NUMBER', 'Fraction of eligible observations matching the deterministic column pattern detector.', true),
  ('sensitive_match_rate', 'Sensitive Match Rate', 'COLUMN', 'NUMBER', 'Fraction of eligible observations matching a sensitive-data detector.', true),
  ('stddev', 'Standard Deviation', 'COLUMN', 'NUMBER', 'Population standard deviation of numeric observations.', true),
  ('unique_count', 'Unique Count', 'COLUMN', 'NUMBER', 'Number of non-null values occurring exactly once.', true),
  ('unique_rate', 'Unique Rate', 'COLUMN', 'NUMBER', 'Fraction of non-null values occurring exactly once.', true),
  ('whitespace_only_count', 'Whitespace-only Count', 'COLUMN', 'NUMBER', 'Number of values containing only whitespace.', true),
  ('zero_count', 'Zero Count', 'COLUMN', 'NUMBER', 'Number of numeric observations equal to zero.', true),
  ('histogram', 'Histogram', 'DISTRIBUTION', 'JSON', 'Deterministic histogram of numeric observations.', true),
  ('quantiles', 'Quantiles', 'DISTRIBUTION', 'JSON', 'Deterministic numeric quantile summary.', true),
  ('top_values', 'Top Values', 'DISTRIBUTION', 'JSON', 'Most frequent non-null values and their counts.', true)
on conflict (metric_key)
do update set
  name = excluded.name,
  scope = excluded.scope,
  value_type = excluded.value_type,
  description = excluded.description,
  enabled = excluded.enabled;

do $$
declare
  missing text[];
begin
  select array_agg(expected.metric_key order by expected.metric_key)
  into missing
  from (
    values
      ('column_count'), ('duplicate_row_count'), ('duplicate_row_rate'), ('row_count'), ('schema_hash'),
      ('candidate_key_confidence'), ('distinct_count'), ('distinct_rate'), ('empty_string_count'),
      ('length_max'), ('length_mean'), ('length_min'), ('max'), ('mean'), ('median'), ('min'),
      ('negative_count'), ('non_null_count'), ('null_count'), ('null_rate'), ('outlier_count'),
      ('outlier_rate'), ('pattern_count'), ('pattern_match_rate'), ('sensitive_match_rate'), ('stddev'),
      ('unique_count'), ('unique_rate'), ('whitespace_only_count'), ('zero_count'),
      ('histogram'), ('quantiles'), ('top_values')
  ) as expected(metric_key)
  where not exists (
    select 1
    from profiling.metric_definitions md
    where md.metric_key = expected.metric_key
      and md.enabled = true
  );

  if missing is not null then
    raise exception 'DETERMINISTIC_METRIC_CATALOG_INCOMPLETE: %', array_to_string(missing, ', ');
  end if;
end
$$;

commit;
