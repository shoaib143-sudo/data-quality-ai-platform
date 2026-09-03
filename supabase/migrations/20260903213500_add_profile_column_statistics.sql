alter table profiling.profile_columns
  add column if not exists total_count bigint check (total_count is null or total_count >= 0),
  add column if not exists non_null_count bigint check (non_null_count is null or non_null_count >= 0),
  add column if not exists null_count bigint check (null_count is null or null_count >= 0),
  add column if not exists blank_count bigint check (blank_count is null or blank_count >= 0),
  add column if not exists zero_count bigint check (zero_count is null or zero_count >= 0),
  add column if not exists distinct_count bigint check (distinct_count is null or distinct_count >= 0),
  add column if not exists distinct_percentage numeric check (distinct_percentage is null or (distinct_percentage >= 0 and distinct_percentage <= 100));
