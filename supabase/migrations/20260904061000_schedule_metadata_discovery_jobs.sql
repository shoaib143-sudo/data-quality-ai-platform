alter table orchestration.job_schedules
  add column if not exists data_source_id uuid references catalog.data_sources(id) on delete cascade;

alter table orchestration.job_schedules alter column dataset_version_id drop not null;

alter table orchestration.job_schedules drop constraint if exists job_schedules_job_type_check;
alter table orchestration.job_schedules add constraint job_schedules_job_type_check
check(job_type in ('PROFILING','DATA_QUALITY','DISCOVERY'));

alter table orchestration.job_schedules drop constraint if exists job_schedules_target_check;
alter table orchestration.job_schedules add constraint job_schedules_target_check check(
  (job_type in ('PROFILING','DATA_QUALITY') and dataset_version_id is not null and data_source_id is null)
  or (job_type='DISCOVERY' and data_source_id is not null and dataset_version_id is null)
);

create index if not exists job_schedules_data_source_idx
on orchestration.job_schedules(data_source_id)
where data_source_id is not null;

select pg_notify('pgrst','reload schema');
