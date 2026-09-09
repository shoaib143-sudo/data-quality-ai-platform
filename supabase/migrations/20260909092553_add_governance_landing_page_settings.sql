create table if not exists governance.landing_page_settings (
  organization_id uuid not null,
  persona_slug text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint landing_page_settings_pkey primary key (organization_id, persona_slug),
  constraint landing_page_settings_persona_slug_check check (persona_slug in (
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
  ))
);

create index if not exists idx_landing_page_settings_org_enabled
  on governance.landing_page_settings (organization_id, enabled);

comment on table governance.landing_page_settings is 'Organization scoped administrator controls for role based DataNexus landing page availability.';
comment on column governance.landing_page_settings.enabled is 'When false, the persona landing page is unavailable for this organization even when a user has the matching governance role.';
