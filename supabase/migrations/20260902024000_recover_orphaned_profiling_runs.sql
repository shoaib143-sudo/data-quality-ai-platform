-- Recover legacy profiling runs that were created before the current agent-run lifecycle.
-- Only stale RUNNING runs without an agent_run_id are affected.

update profiling.profile_runs
set status = 'FAILED',
    completed_at = coalesce(completed_at, now()),
    error_code = coalesce(error_code, 'STALE_RUN_RECOVERY'),
    error_message = coalesce(
      error_message,
      'Recovered stale profiling run created before the current agent-run lifecycle was established.'
    ),
    summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
      'recovery', jsonb_build_object(
        'type', 'orphaned_profiling_run',
        'reason', 'No agent_run_id was associated with the run.',
        'recovered_at', now()
      )
    )
where status = 'RUNNING'
  and agent_run_id is null
  and started_at < now() - interval '24 hours';
