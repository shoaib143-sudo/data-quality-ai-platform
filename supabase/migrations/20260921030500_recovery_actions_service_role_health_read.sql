-- Allow the server-side release-schema health contract to verify crash-fencing state.
-- The service role is already the internal privileged runtime identity. This grant is read-only.

grant select on table orchestration.recovery_actions to service_role;

comment on table orchestration.recovery_actions is
  'Governed recovery action evidence. service_role has read access for internal runtime and release-schema verification; mutation authority remains constrained by dedicated functions and policies.';
