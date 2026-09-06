create index if not exists data_contracts_current_version_fk_idx
  on governance.data_contracts (current_version_id);

create index if not exists data_contract_version_events_contract_fk_idx
  on governance.data_contract_version_events (contract_id);

create index if not exists data_contract_version_events_project_fk_idx
  on governance.data_contract_version_events (project_id);

create index if not exists data_contract_evaluation_events_contract_fk_idx
  on governance.data_contract_evaluation_events (contract_id);

create index if not exists data_contract_evaluation_events_contract_version_fk_idx
  on governance.data_contract_evaluation_events (contract_version_id);

create index if not exists data_contract_evaluation_events_profile_run_fk_idx
  on governance.data_contract_evaluation_events (profile_run_id);

create index if not exists data_contract_evaluation_events_project_fk_idx
  on governance.data_contract_evaluation_events (project_id);
