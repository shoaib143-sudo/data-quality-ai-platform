create table if not exists governance.regulatory_applicability (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  regulation_document_id uuid not null references governance.knowledge_documents(id) on delete cascade,
  scope_type text not null check (scope_type in ('DATASET','COLUMN','CDE','DOMAIN')),
  scope_key text not null,
  applicability_status text not null default 'REVIEW_REQUIRED' check (applicability_status in ('APPLICABLE','NOT_APPLICABLE','REVIEW_REQUIRED')),
  rationale text not null,
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, regulation_document_id, scope_type, scope_key)
);

create table if not exists governance.accountability_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  scope_type text not null check (scope_type in ('DATASET','CDE','DOMAIN')),
  scope_key text not null,
  assignment_type text not null check (assignment_type in ('BUSINESS_OWNER','TECHNICAL_OWNER','DATA_STEWARD')),
  principal_type text not null default 'ROLE' check (principal_type in ('ROLE','USER')),
  principal_key text not null,
  principal_name text not null,
  accountability text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, scope_type, scope_key, assignment_type, principal_key)
);

create table if not exists governance.dataset_certifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  certification_key text not null,
  certification_status text not null check (certification_status in ('CERTIFIED','PROVISIONAL','EXPIRED')),
  certification_level text not null default 'STANDARD' check (certification_level in ('STANDARD','CRITICAL','REGULATED')),
  valid_from timestamptz,
  valid_until timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  decision_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, certification_key)
);

create table if not exists governance.remediation_knowledge (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid references catalog.datasets(id) on delete set null,
  issue_id uuid references governance.issues(id) on delete set null,
  knowledge_key text not null,
  problem_type text not null,
  symptom text not null,
  remediation_action text not null,
  outcome_status text not null check (outcome_status in ('WORKED','PARTIAL','FAILED')),
  before_evidence jsonb not null default '{}'::jsonb,
  after_evidence jsonb not null default '{}'::jsonb,
  reusable_guidance text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, knowledge_key)
);

create index if not exists idx_regulatory_applicability_scope on governance.regulatory_applicability(project_id, scope_type, scope_key, applicability_status);
create index if not exists idx_accountability_assignments_scope on governance.accountability_assignments(project_id, scope_type, scope_key, assignment_type, status);
create index if not exists idx_dataset_certifications_dataset on governance.dataset_certifications(project_id, dataset_id, certification_status);
create index if not exists idx_remediation_knowledge_problem on governance.remediation_knowledge(project_id, problem_type, outcome_status);

alter table governance.regulatory_applicability enable row level security;
alter table governance.accountability_assignments enable row level security;
alter table governance.dataset_certifications enable row level security;
alter table governance.remediation_knowledge enable row level security;

do $$
declare t text;
begin
  foreach t in array array['regulatory_applicability','accountability_assignments','dataset_certifications','remediation_knowledge'] loop
    execute format('create policy %I on governance.%I for select to authenticated using (app_private.is_project_member(project_id))', t || '_project_read', t);
    execute format('create policy %I on governance.%I for insert to authenticated with check (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update''))', t || '_project_insert', t);
    execute format('create policy %I on governance.%I for update to authenticated using (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update'')) with check (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update''))', t || '_project_update', t);
    execute format('create policy %I on governance.%I for delete to authenticated using (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update''))', t || '_project_delete', t);
  end loop;
end $$;

grant select, insert, update, delete on governance.regulatory_applicability, governance.accountability_assignments, governance.dataset_certifications, governance.remediation_knowledge to authenticated;
grant all on governance.regulatory_applicability, governance.accountability_assignments, governance.dataset_certifications, governance.remediation_knowledge to service_role;
