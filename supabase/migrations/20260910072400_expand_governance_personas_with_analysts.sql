-- Expand the finalized governance persona catalog with Metadata Analyst and Data Quality Analyst.
-- Organization OWNER/ADMIN remains a separate tenancy and administration privilege.

alter table governance.landing_page_settings
  drop constraint if exists landing_page_settings_persona_slug_check;

alter table governance.landing_page_settings
  add constraint landing_page_settings_persona_slug_check
  check (persona_slug = any (array[
    'senior-leadership'::text,
    'business-user'::text,
    'data-owner'::text,
    'data-steward'::text,
    'data-governance-admin'::text,
    'data-governance-specialist'::text,
    'compliance-risk-officer'::text,
    'privacy-security-officer'::text,
    'data-custodian'::text,
    'data-product-owner'::text,
    'source-system-owner'::text,
    'metadata-analyst'::text,
    'data-quality-analyst'::text
  ]));

insert into governance.access_roles (role_key, name, description, capabilities, system_role)
values
  (
    'METADATA_ANALYST',
    'Metadata Analyst',
    'Analyzes metadata completeness, glossary coverage, ownership, classification, lineage and schema change evidence.',
    array[
      'catalog.read','catalog.update','glossary.read','glossary.manage','lineage.read',
      'profiling.read','quality.read','observability.read','issues.manage',
      'classification.review','report.export','audit.read'
    ],
    true
  ),
  (
    'DATA_QUALITY_ANALYST',
    'Data Quality Analyst',
    'Analyzes data quality trends, dimensions, findings, root causes and evidence-backed improvement opportunities.',
    array[
      'catalog.read','profiling.read','profiling.execute','quality.read','quality.manage','quality.execute',
      'observability.read','issues.manage','report.export','audit.read','agent.execute'
    ],
    true
  )
on conflict (role_key) do update set
  name = excluded.name,
  description = excluded.description,
  capabilities = excluded.capabilities,
  system_role = excluded.system_role;
