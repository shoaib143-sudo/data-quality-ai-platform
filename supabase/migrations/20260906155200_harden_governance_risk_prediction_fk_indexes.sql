create index if not exists governance_risk_prediction_events_dataset_fk_idx
  on governance.governance_risk_prediction_events (dataset_id);

create index if not exists governance_risk_prediction_events_prediction_fk_idx
  on governance.governance_risk_prediction_events (prediction_id);
