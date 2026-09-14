-- Explicit project environment classification for approval policy.
-- Existing projects remain unclassified until a governance administrator sets them.

alter table app.projects
  add column if not exists environment_class text
    check (environment_class in ('NON_PRODUCTION','PRODUCTION'));

create index if not exists idx_projects_environment_class
  on app.projects(environment_class);

comment on column app.projects.environment_class is
  'Authoritative environment classification used by Agent Policy v2. NULL means unclassified and approval evaluation fails closed.';
