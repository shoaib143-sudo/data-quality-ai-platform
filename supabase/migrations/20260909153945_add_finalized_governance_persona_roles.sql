-- Align the project governance role catalog with the finalized 11-persona model.
-- Organization OWNER/ADMIN remains a separate tenancy/administration privilege.
-- Legacy operational roles remain available for compatibility.

insert into governance.access_roles (role_key, name, description, capabilities, system_role)
values
  ('SENIOR_LEADERSHIP', 'Senior Leadership', 'Enterprise governance confidence, material risk, business impact and outcomes.', array['catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read','audit.read','report.export'], true),
  ('BUSINESS_USER', 'Business User', 'Discovers and consumes governed data with trust, glossary and quality context.', array['catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read','report.export'], true),
  ('DATA_PRODUCT_OWNER', 'Data Product Owner', 'Owns data product trust, certification, quality, lineage and consumer outcomes.', array['catalog.read','catalog.update','glossary.read','lineage.read','profiling.read','quality.read','quality.manage','observability.read','issues.manage','certification.request','certification.review','contract.manage','report.export'], true),
  ('DATA_GOVERNANCE_SPECIALIST', 'Data Governance Specialist', 'Operates governance policy, stewardship, classification, controls, maturity and adoption.', array['catalog.read','catalog.update','glossary.read','glossary.manage','lineage.read','profiling.read','quality.read','observability.read','issues.manage','classification.review','policy.approve','certification.request','certification.review','stewardship.manage','retention.manage','report.export','audit.read'], true),
  ('COMPLIANCE_RISK_OFFICER', 'Compliance & Risk Officer', 'Reviews regulatory exposure, control effectiveness, exceptions and audit evidence.', array['catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read','issues.manage','classification.review','policy.approve','quality.exception.approve','certification.review','report.export','audit.read'], true),
  ('PRIVACY_SECURITY_OFFICER', 'Privacy & Security Officer', 'Reviews sensitive data, classification, privacy exposure, lineage and audit evidence.', array['catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read','issues.manage','classification.review','policy.approve','report.export','audit.read'], true),
  ('DATA_GOVERNANCE_ADMIN', 'Data Governance Admin', 'Operates governance platform configuration and workflows without organization administration privilege.', array['catalog.read','catalog.update','glossary.read','glossary.manage','lineage.read','lineage.manage','profiling.read','profiling.execute','quality.read','quality.manage','quality.execute','observability.read','observability.manage','issues.manage','classification.review','certification.request','certification.review','stewardship.manage','source.manage','schedule.manage','notification.manage','workflow.manage','discovery.execute','capacity.manage','retention.manage','report.export','audit.read','agent.execute'], true),
  ('DATA_CUSTODIAN', 'Data Custodian / Technical Steward', 'Operates technical controls, sources, profiling, observability and remediation.', array['catalog.read','catalog.update','lineage.read','lineage.manage','profiling.read','profiling.execute','quality.read','quality.execute','observability.read','observability.manage','issues.manage','source.manage','schedule.manage','discovery.execute','agent.execute'], true),
  ('SOURCE_SYSTEM_OWNER', 'Source System / Application Owner', 'Owns upstream source reliability, recurring defects and downstream impact remediation.', array['catalog.read','catalog.update','lineage.read','profiling.read','profiling.execute','quality.read','quality.execute','observability.read','observability.manage','issues.manage','source.manage','schedule.manage','report.export'], true)
on conflict (role_key) do update set
  name = excluded.name,
  description = excluded.description,
  capabilities = excluded.capabilities,
  system_role = excluded.system_role;

update governance.access_roles
set name = 'Data Owner',
    description = 'Owns governed data domain policy, certification, quality and control decisions.'
where role_key = 'DATA_OWNER';

update governance.access_roles
set name = 'Data Steward',
    description = 'Operates metadata, stewardship, issues, classifications and remediation.'
where role_key = 'DATA_STEWARD';
