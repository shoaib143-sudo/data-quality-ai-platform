-- Keep release-schema health checks aligned with the live schema while preserving
-- least privilege for the server-side service role.

grant select on table orchestration.recovery_actions to service_role;

comment on table orchestration.recovery_actions is
  'Governed recovery action evidence. service_role has read access for internal runtime and release-schema verification; mutation authority remains constrained by dedicated functions and policies.';
