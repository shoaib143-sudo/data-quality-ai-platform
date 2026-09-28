begin;

create table if not exists governance.maturity_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  framework_version text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','BASELINE','COMPLETE','ARCHIVED')),
  organization_profile jsonb not null default '{}'::jsonb,
  scorecard jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists maturity_assessments_org_created_idx
  on governance.maturity_assessments(organization_id, created_at desc);

create index if not exists maturity_assessments_framework_idx
  on governance.maturity_assessments(framework_version, organization_id);

create table if not exists governance.maturity_assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references governance.maturity_assessments(id) on delete cascade,
  question_id text not null,
  respondent_user_id uuid not null,
  maturity smallint not null check (maturity between 0 and 5),
  target smallint check (target between 0 and 5),
  priority text not null default 'MEDIUM' check (priority in ('HIGH','MEDIUM','LOW')),
  evidence_confidence numeric(5,2) check (evidence_confidence between 0 and 100),
  coverage numeric(5,2) check (coverage between 0 and 100),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, question_id, respondent_user_id)
);

create index if not exists maturity_responses_assessment_idx
  on governance.maturity_assessment_responses(assessment_id, question_id);

create index if not exists maturity_responses_respondent_idx
  on governance.maturity_assessment_responses(respondent_user_id, assessment_id);

create table if not exists governance.maturity_assessment_evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references governance.maturity_assessments(id) on delete cascade,
  response_id uuid references governance.maturity_assessment_responses(id) on delete cascade,
  question_id text not null,
  evidence_type text not null check (evidence_type in ('DOCUMENT','URL','CONTROL_REPORT','SYSTEM_CONNECTION','OWNER_ATTESTATION','AUDIT_RESULT','COMMENT')),
  label text not null,
  reference_uri text,
  verification_state text not null default 'SELF_DECLARED'
    check (verification_state in ('SELF_DECLARED','CORROBORATED','EVIDENCE_SUPPORTED','SYSTEM_OBSERVED','CONTINUOUSLY_VERIFIED','CONFLICTING','EXPIRED')),
  metadata jsonb not null default '{}'::jsonb,
  provided_by uuid not null,
  provided_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz
);

create index if not exists maturity_evidence_assessment_idx
  on governance.maturity_assessment_evidence(assessment_id, question_id);

create table if not exists governance.maturity_assessment_observations (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references governance.maturity_assessments(id) on delete cascade,
  question_id text not null,
  source_key text not null,
  observed_maturity numeric(4,2) check (observed_maturity between 0 and 5),
  confidence numeric(5,2) check (confidence between 0 and 100),
  coverage numeric(5,2) check (coverage between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists maturity_observations_assessment_idx
  on governance.maturity_assessment_observations(assessment_id, question_id, observed_at desc);

alter table governance.maturity_assessments enable row level security;
alter table governance.maturity_assessment_responses enable row level security;
alter table governance.maturity_assessment_evidence enable row level security;
alter table governance.maturity_assessment_observations enable row level security;

revoke all on governance.maturity_assessments from public, anon, authenticated;
revoke all on governance.maturity_assessment_responses from public, anon, authenticated;
revoke all on governance.maturity_assessment_evidence from public, anon, authenticated;
revoke all on governance.maturity_assessment_observations from public, anon, authenticated;

grant select, insert, update, delete on governance.maturity_assessments to service_role;
grant select, insert, update, delete on governance.maturity_assessment_responses to service_role;
grant select, insert, update, delete on governance.maturity_assessment_evidence to service_role;
grant select, insert, update, delete on governance.maturity_assessment_observations to service_role;

comment on table governance.maturity_assessments is
  'Versioned DataNexus organizational governance maturity assessments. Scores are DataNexus assessment outputs, not regulatory certification.';
comment on table governance.maturity_assessment_responses is
  'Per-respondent behavioral maturity answers. Multiple respondents are preserved so consensus and perception gaps remain auditable.';
comment on table governance.maturity_assessment_evidence is
  'Evidence references supporting maturity answers. Evidence lifecycle is independent from the declared maturity answer.';
comment on table governance.maturity_assessment_observations is
  'Machine-observed capability evidence used to corroborate or challenge self-declared maturity without overwriting respondent answers.';

commit;
