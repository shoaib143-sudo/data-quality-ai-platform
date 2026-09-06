create index if not exists glossary_terms_approved_by_fk_idx
  on governance.glossary_terms (approved_by);

create index if not exists glossary_terms_last_changed_by_fk_idx
  on governance.glossary_terms (last_changed_by);
