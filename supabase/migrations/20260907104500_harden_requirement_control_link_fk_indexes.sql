create index if not exists requirement_control_links_control_fk_idx
  on governance.requirement_control_links (control_id);

create index if not exists requirement_control_links_requirement_fk_idx
  on governance.requirement_control_links (requirement_id);
