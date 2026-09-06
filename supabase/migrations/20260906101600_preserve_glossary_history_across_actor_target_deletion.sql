-- Append-only evidence stores historical identifiers as values rather than mutable foreign keys.
-- This prevents user deprovisioning or target retirement from attempting to rewrite evidence rows.

alter table governance.glossary_term_versions
  drop constraint if exists glossary_term_versions_owner_user_id_fkey,
  drop constraint if exists glossary_term_versions_approved_by_fkey,
  drop constraint if exists glossary_term_versions_changed_by_fkey;

alter table governance.glossary_mapping_decisions
  drop constraint if exists glossary_mapping_decisions_actor_user_id_fkey,
  drop constraint if exists glossary_mapping_decisions_dataset_id_fkey,
  drop constraint if exists glossary_mapping_decisions_discovered_asset_id_fkey,
  drop constraint if exists glossary_mapping_decisions_data_source_id_fkey;

comment on column governance.glossary_term_versions.owner_user_id is 'Historical actor identifier retained immutably even if the auth user is later deprovisioned.';
comment on column governance.glossary_term_versions.approved_by is 'Historical approving actor identifier retained immutably even if the auth user is later deprovisioned.';
comment on column governance.glossary_term_versions.changed_by is 'Historical changing actor identifier retained immutably even if the auth user is later deprovisioned.';
comment on column governance.glossary_mapping_decisions.actor_user_id is 'Historical decision actor identifier retained immutably without an ON DELETE rewrite.';
