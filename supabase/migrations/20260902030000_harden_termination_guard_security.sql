-- The termination guard is invoked by database triggers and is not an application RPC.
-- Keep the existing trigger behavior while removing direct Data API execution paths.
revoke execute on function agent.prevent_terminated_run_reactivation() from public;
revoke execute on function agent.prevent_terminated_run_reactivation() from anon;
revoke execute on function agent.prevent_terminated_run_reactivation() from authenticated;
