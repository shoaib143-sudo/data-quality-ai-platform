-- Agent Policy v2 read/conversation capabilities for all canonical governance personas.
-- Mutating execution/approval capabilities are intentionally not broadened here.

with canonical_roles(role_key) as (
  values
    ('SENIOR_LEADERSHIP'),
    ('BUSINESS_USER'),
    ('DATA_OWNER'),
    ('DATA_PRODUCT_OWNER'),
    ('DATA_STEWARD'),
    ('DATA_GOVERNANCE_SPECIALIST'),
    ('COMPLIANCE_RISK_OFFICER'),
    ('PRIVACY_SECURITY_OFFICER'),
    ('DATA_GOVERNANCE_ADMIN'),
    ('DATA_CUSTODIAN'),
    ('SOURCE_SYSTEM_OWNER'),
    ('METADATA_ANALYST'),
    ('DATA_QUALITY_ANALYST')
),
expanded as (
  select
    ar.role_key,
    array(
      select distinct capability
      from unnest(
        ar.capabilities || array[
          'agent.view',
          'agent.converse',
          'agent.investigate',
          'agent.recommend',
          'execution.view',
          'execution.view_results',
          'execution.view_evidence'
        ]::text[]
      ) capability
      order by capability
    ) as capabilities
  from governance.access_roles ar
  join canonical_roles cr on cr.role_key = ar.role_key
)
update governance.access_roles ar
set capabilities = expanded.capabilities
from expanded
where ar.role_key = expanded.role_key;
