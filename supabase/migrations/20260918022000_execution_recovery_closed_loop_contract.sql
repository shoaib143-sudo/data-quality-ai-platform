-- Extend the existing Execution Recovery Agent ledger for closed-loop P0/P1 recovery.
-- Historical rows remain nullable rather than fabricating diagnosis or repair evidence.

alter table orchestration.recovery_cases
  add column if not exists original_workflow_run_id uuid null,
  add column if not exists failing_stage text null,
  add column if not exists failing_checkpoint_id text null,
  add column if not exists severity text null,
  add column if not exists root_cause_diagnosis text null,
  add column if not exists proposed_repair text null,
  add column if not exists authorization_decision text null,
  add column if not exists repair_action_tool text null,
  add column if not exists mutation_scope text null,
  add column if not exists pre_repair_checkpoint_id text null,
  add column if not exists post_repair_validation_result text null,
  add column if not exists retry_stage text null,
  add column if not exists retry_checkpoint_id text null,
  add column if not exists retry_attempt integer not null default 0,
  add column if not exists final_outcome text not null default 'OPEN',
  add column if not exists escalation_reason text null;

alter table orchestration.recovery_cases
  drop constraint if exists recovery_cases_severity_check,
  add constraint recovery_cases_severity_check
    check (severity is null or severity in ('P0', 'P1', 'P2', 'P3')),
  drop constraint if exists recovery_cases_authorization_decision_check,
  add constraint recovery_cases_authorization_decision_check
    check (authorization_decision is null or authorization_decision in ('AUTHORIZED', 'BLOCKED', 'ESCALATE')),
  drop constraint if exists recovery_cases_post_repair_validation_result_check,
  add constraint recovery_cases_post_repair_validation_result_check
    check (post_repair_validation_result is null or post_repair_validation_result in ('NOT_RUN', 'PASSED', 'FAILED')),
  drop constraint if exists recovery_cases_final_outcome_check,
  add constraint recovery_cases_final_outcome_check
    check (final_outcome in ('OPEN', 'RECOVERED', 'FAILED', 'ESCALATED')),
  drop constraint if exists recovery_cases_retry_attempt_check,
  add constraint recovery_cases_retry_attempt_check
    check (retry_attempt >= 0);

alter table orchestration.recovery_actions
  drop constraint if exists recovery_actions_action_type_check,
  add constraint recovery_actions_action_type_check
    check (action_type in ('RETRY', 'ACKNOWLEDGE', 'ROLLBACK_REVIEW', 'AUTO_REPAIR', 'VALIDATE', 'RESUME'));

create index if not exists recovery_cases_workflow_outcome_idx
  on orchestration.recovery_cases(project_id, original_workflow_run_id, final_outcome, updated_at desc)
  where original_workflow_run_id is not null;

comment on column orchestration.recovery_cases.severity is
  'Deterministic recovery severity. Only P0/P1 are eligible for autonomous repair; P2+ remains evidence-only.';
comment on column orchestration.recovery_cases.root_cause_diagnosis is
  'Evidence-backed root-cause diagnosis produced before any repair is authorized.';
comment on column orchestration.recovery_cases.post_repair_validation_result is
  'Independent validation gate. Retry/resume must not proceed as recovered until this is PASSED.';
comment on column orchestration.recovery_cases.retry_checkpoint_id is
  'Checkpoint retained for FAILED_JOB recovery. Heavy PROFILING, DISCOVERY, and DATA_QUALITY whole-job restarts clear this value.';
comment on column orchestration.recovery_cases.final_outcome is
  'Canonical closed-loop outcome for failure -> diagnosis -> repair -> validation -> retry/resume -> outcome.';
