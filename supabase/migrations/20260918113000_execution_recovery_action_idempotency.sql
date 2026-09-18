-- Idempotent audit evidence for autonomous closed-loop recovery actions.

alter table orchestration.recovery_actions
  add column if not exists idempotency_key text null;

create unique index if not exists recovery_actions_case_idempotency_idx
  on orchestration.recovery_actions(recovery_case_id, idempotency_key)
  where idempotency_key is not null;

comment on column orchestration.recovery_actions.idempotency_key is
  'Stable recovery action identity preventing duplicate automatic repair, validation, or resume evidence on replay.';
