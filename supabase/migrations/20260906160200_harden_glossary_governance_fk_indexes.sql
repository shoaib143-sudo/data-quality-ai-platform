create index if not exists glossary_mapping_decisions_term_fk_idx
  on governance.glossary_mapping_decisions (term_id);

create index if not exists glossary_mappings_discovered_asset_fk_idx
  on governance.glossary_mappings (discovered_asset_id);

create index if not exists glossary_mappings_proposed_by_fk_idx
  on governance.glossary_mappings (proposed_by);

create index if not exists glossary_mappings_reviewed_by_fk_idx
  on governance.glossary_mappings (reviewed_by);

create index if not exists glossary_mappings_last_changed_by_fk_idx
  on governance.glossary_mappings (last_changed_by);
