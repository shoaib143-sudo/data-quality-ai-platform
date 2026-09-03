begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table profiling.dataset_execution_sources enable row level security;
alter table profiling.data_quality_scores enable row level security;

revoke all on table profiling.dataset_execution_sources from anon;
revoke all on table profiling.data_quality_scores from anon;

drop policy if exists execution_source_select on profiling.dataset_execution_sources;
create policy execution_source_select
on profiling.dataset_execution_sources
for select
to authenticated
using (
  exists (
    select 1
    from catalog.dataset_versions v
    join catalog.datasets d on d.id = v.dataset_id
    where v.id = dataset_execution_sources.dataset_version_id
      and app_private.is_project_member(d.project_id)
  )
);

drop policy if exists quality_score_select on profiling.data_quality_scores;
create policy quality_score_select
on profiling.data_quality_scores
for select
to authenticated
using (
  exists (
    select 1
    from profiling.profile_runs r
    join catalog.dataset_versions v on v.id = r.dataset_version_id
    join catalog.datasets d on d.id = v.dataset_id
    where r.id = data_quality_scores.profile_run_id
      and app_private.is_project_member(d.project_id)
  )
);

commit;
