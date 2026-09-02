begin;

alter table profiling.profile_runs
  add column if not exists summary jsonb not null default '{}'::jsonb,
  add column if not exists error_code text,
  add column if not exists error_message text;

create index if not exists profile_runs_error_idx
  on profiling.profile_runs (error_code, started_at desc);

commit;
