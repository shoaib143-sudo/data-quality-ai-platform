create table if not exists governance.organization_ui_preferences (
  organization_id uuid primary key references app.organizations(id) on delete cascade,
  role_landing_pages_enabled boolean not null default true,
  enabled_personas text[] not null default array[
    'senior-leadership',
    'business-user',
    'data-owner',
    'data-steward',
    'data-governance-admin',
    'data-governance-specialist',
    'compliance-risk-officer',
    'privacy-security-officer',
    'data-custodian',
    'data-product-owner',
    'source-system-owner'
  ]::text[],
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  constraint organization_ui_preferences_enabled_personas_valid check (
    enabled_personas <@ array[
      'senior-leadership',
      'business-user',
      'data-owner',
      'data-steward',
      'data-governance-admin',
      'data-governance-specialist',
      'compliance-risk-officer',
      'privacy-security-officer',
      'data-custodian',
      'data-product-owner',
      'source-system-owner'
    ]::text[]
  )
);

alter table governance.organization_ui_preferences enable row level security;

drop policy if exists organization_ui_preferences_read on governance.organization_ui_preferences;
create policy organization_ui_preferences_read
on governance.organization_ui_preferences
for select
to authenticated
using (
  exists (
    select 1
    from app.organization_members m
    where m.organization_id = organization_ui_preferences.organization_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists organization_ui_preferences_admin_insert on governance.organization_ui_preferences;
create policy organization_ui_preferences_admin_insert
on governance.organization_ui_preferences
for insert
to authenticated
with check (app_private.is_org_admin(organization_id));

drop policy if exists organization_ui_preferences_admin_update on governance.organization_ui_preferences;
create policy organization_ui_preferences_admin_update
on governance.organization_ui_preferences
for update
to authenticated
using (app_private.is_org_admin(organization_id))
with check (app_private.is_org_admin(organization_id));

grant select, insert, update on governance.organization_ui_preferences to authenticated;
revoke all on governance.organization_ui_preferences from anon;
