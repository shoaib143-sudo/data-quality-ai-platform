alter table governance.landing_page_settings
  add constraint landing_page_settings_organization_id_fkey
  foreign key (organization_id) references app.organizations(id) on delete cascade;

alter table governance.landing_page_settings
  add constraint landing_page_settings_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

alter table governance.landing_page_settings enable row level security;

revoke all on table governance.landing_page_settings from anon, authenticated;
grant select, insert, update, delete on table governance.landing_page_settings to service_role;
