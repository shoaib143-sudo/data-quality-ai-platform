begin;

create table if not exists governance.autonomy_action_outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  autonomy_action_id uuid not null unique references governance.autonomy_actions(id) on delete restrict,
  source_agent_run_id uuid null references agent.agent_runs(id) on delete restrict,
  profile_run_id uuid null references profiling.profile_runs(id) on delete restrict,
  issue_id uuid null references governance.issues(id) on delete restrict,
  action_key text not null,
  verification_status text not null default 'PENDING'
    check (verification_status in ('PENDING','VERIFIED','FAILED','UNKNOWN')),
  verifier_type text not null default 'SYSTEM'
    check (verifier_type in ('SYSTEM','HUMAN')),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  verification_evidence jsonb not null default '{}'::jsonb,
  effectiveness numeric null check (effectiveness is null or (effectiveness >= 0 and effectiveness <= 1)),
  failure_code text null,
  failure_detail text null,
  verified_by uuid null references auth.users(id) on delete restrict,
  verified_at timestamptz null,
  learning_case_id uuid null unique references agent.agent_learning_cases(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_action_outcomes_verified_evidence_ck check (
    verification_status <> 'VERIFIED'
    or (verified_at is not null and verification_evidence <> '{}'::jsonb)
  ),
  constraint autonomy_action_outcomes_learning_verified_ck check (
    learning_case_id is null
    or (verification_status = 'VERIFIED' and verified_at is not null and effectiveness is not null)
  )
);

create index if not exists idx_autonomy_action_outcomes_project_status
  on governance.autonomy_action_outcomes(project_id, verification_status, updated_at desc);
create index if not exists idx_autonomy_action_outcomes_profile_run
  on governance.autonomy_action_outcomes(profile_run_id)
  where profile_run_id is not null;
create index if not exists idx_autonomy_action_outcomes_source_agent_run
  on governance.autonomy_action_outcomes(source_agent_run_id)
  where source_agent_run_id is not null;

alter table governance.autonomy_action_outcomes enable row level security;

revoke all on table governance.autonomy_action_outcomes from public, anon, authenticated;
grant select, insert, update, references, trigger on table governance.autonomy_action_outcomes to service_role;

create policy autonomy_action_outcomes_service_only
  on governance.autonomy_action_outcomes
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table governance.autonomy_action_outcomes is
  'V5 evidence ledger separating governed action execution from verified outcome and reusable learning.';
comment on column governance.autonomy_action_outcomes.verification_status is
  'Outcome truth. EXECUTED autonomy action state alone never implies VERIFIED outcome.';
comment on column governance.autonomy_action_outcomes.learning_case_id is
  'Set only after a VERIFIED outcome with measurable effectiveness is promoted into agent.agent_learning_cases.';

commit;
