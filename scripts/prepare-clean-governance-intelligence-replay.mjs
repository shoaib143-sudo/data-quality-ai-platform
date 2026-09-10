import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260904232120'
const replay = `${version}_reconstruct_governance_intelligence_tables.sql`
const targetPath = path.join(targetDir, replay)

const collision = fs.readdirSync(targetDir).some((name) => name.startsWith(`${version}_`))
if (collision) throw new Error(`Governance intelligence replay version collides with existing migration ${version}`)

const sql = `
create table if not exists governance.critical_data_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  cde_key text not null,
  name text not null,
  definition text not null,
  domain text not null,
  criticality text not null default 'HIGH' check (criticality = any(array['MEDIUM','HIGH','CRITICAL'])),
  regulatory_relevance text[] not null default '{}',
  classification_label_id uuid references governance.classification_labels(id) on delete set null,
  owner_role text,
  steward_role text,
  status text not null default 'ACTIVE' check (status = any(array['DRAFT','ACTIVE','RETIRED'])),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,cde_key)
);

create table if not exists governance.cde_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  cde_id uuid not null references governance.critical_data_elements(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  column_name text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'SUGGESTED' check (status = any(array['SUGGESTED','APPROVED','REJECTED'])),
  source text not null default 'KNOWLEDGE_BOOTSTRAP',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,cde_id,dataset_id,column_name)
);

create table if not exists governance.dataset_certifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  certification_key text not null,
  certification_status text not null check (certification_status = any(array['CERTIFIED','PROVISIONAL','EXPIRED'])),
  certification_level text not null default 'STANDARD' check (certification_level = any(array['STANDARD','CRITICAL','REGULATED'])),
  valid_from timestamptz,
  valid_until timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  decision_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,certification_key)
);

create table if not exists governance.knowledge_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  document_id uuid not null references governance.knowledge_documents(id) on delete cascade,
  requirement_key text not null,
  title text not null,
  requirement_text text not null,
  obligation_type text not null default 'CONTROL' check (obligation_type = any(array['PRINCIPLE','CONTROL','QUALITY_EXPECTATION','PROCESS','EVIDENCE'])),
  priority text not null default 'MEDIUM' check (priority = any(array['LOW','MEDIUM','HIGH','CRITICAL'])),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,requirement_key)
);

create table if not exists governance.regulatory_applicability (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  regulation_document_id uuid not null references governance.knowledge_documents(id) on delete cascade,
  scope_type text not null check (scope_type = any(array['DATASET','COLUMN','CDE','DOMAIN'])),
  scope_key text not null,
  applicability_status text not null default 'REVIEW_REQUIRED' check (applicability_status = any(array['APPLICABLE','NOT_APPLICABLE','REVIEW_REQUIRED'])),
  rationale text not null,
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,regulation_document_id,scope_type,scope_key)
);

alter table governance.critical_data_elements enable row level security;
alter table governance.cde_mappings enable row level security;
alter table governance.dataset_certifications enable row level security;
alter table governance.knowledge_requirements enable row level security;
alter table governance.regulatory_applicability enable row level security;

create policy critical_data_elements_project_read on governance.critical_data_elements for select to authenticated using(app_private.is_project_member(project_id));
create policy cde_mappings_project_read on governance.cde_mappings for select to authenticated using(app_private.is_project_member(project_id));
create policy dataset_certifications_project_read on governance.dataset_certifications for select to authenticated using(app_private.is_project_member(project_id));
create policy knowledge_requirements_project_read on governance.knowledge_requirements for select to authenticated using(app_private.is_project_member(project_id));
create policy regulatory_applicability_project_read on governance.regulatory_applicability for select to authenticated using(app_private.is_project_member(project_id));

create policy critical_data_elements_project_insert on governance.critical_data_elements for insert to authenticated with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy cde_mappings_project_insert on governance.cde_mappings for insert to authenticated with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy dataset_certifications_project_insert on governance.dataset_certifications for insert to authenticated with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy knowledge_requirements_project_insert on governance.knowledge_requirements for insert to authenticated with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy regulatory_applicability_project_insert on governance.regulatory_applicability for insert to authenticated with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));

create policy critical_data_elements_project_update on governance.critical_data_elements for update to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')) with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy cde_mappings_project_update on governance.cde_mappings for update to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')) with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy dataset_certifications_project_update on governance.dataset_certifications for update to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')) with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy knowledge_requirements_project_update on governance.knowledge_requirements for update to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')) with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy regulatory_applicability_project_update on governance.regulatory_applicability for update to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')) with check(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));

create policy critical_data_elements_project_delete on governance.critical_data_elements for delete to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy cde_mappings_project_delete on governance.cde_mappings for delete to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy dataset_certifications_project_delete on governance.dataset_certifications for delete to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy knowledge_requirements_project_delete on governance.knowledge_requirements for delete to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));
create policy regulatory_applicability_project_delete on governance.regulatory_applicability for delete to authenticated using(app_private.is_project_member(project_id) and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update'));

grant select,insert,update,delete on governance.critical_data_elements,governance.cde_mappings,governance.dataset_certifications,governance.knowledge_requirements,governance.regulatory_applicability to authenticated;
grant all on governance.critical_data_elements,governance.cde_mappings,governance.dataset_certifications,governance.knowledge_requirements,governance.regulatory_applicability to service_role;
`

fs.writeFileSync(targetPath, sql.trimStart())
console.log(`RECONSTRUCTED ${replay}: released governance AI FK-index history references CDE, certification, knowledge requirement, and regulatory applicability relations before their creation is represented; replay restores their historical pre-review contracts.`)
