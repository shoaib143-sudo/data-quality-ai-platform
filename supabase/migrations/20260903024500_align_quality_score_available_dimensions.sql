create or replace function profiling.calculate_quality_score(p_profile_run_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, profiling
as $function$
declare
  v_score numeric;
  v_dimension_count integer;
begin
  select
    coalesce(completeness_score, 0)
    + coalesce(uniqueness_score, 0)
    + coalesce(validity_score, 0)
    + coalesce(accuracy_score, 0),
    (case when completeness_score is not null then 1 else 0 end)
    + (case when uniqueness_score is not null then 1 else 0 end)
    + (case when validity_score is not null then 1 else 0 end)
    + (case when accuracy_score is not null then 1 else 0 end)
  into v_score, v_dimension_count
  from profiling.data_quality_scores
  where profile_run_id = p_profile_run_id;

  if not found then
    return;
  end if;

  update profiling.data_quality_scores
  set overall_score = case
    when v_dimension_count > 0 then round(v_score / v_dimension_count, 4)
    else null
  end
  where profile_run_id = p_profile_run_id;
end;
$function$;
