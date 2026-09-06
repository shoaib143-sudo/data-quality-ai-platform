create index if not exists control_scope_bindings_control_fk_idx
  on governance.control_scope_bindings (control_id);

create index if not exists control_scope_bindings_data_source_fk_idx
  on governance.control_scope_bindings (data_source_id);
