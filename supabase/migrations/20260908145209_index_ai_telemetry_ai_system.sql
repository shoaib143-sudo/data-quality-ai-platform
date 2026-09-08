create index ai_telemetry_events_ai_system_idx
  on governance.ai_telemetry_events(ai_system_id, observed_at desc)
  where ai_system_id is not null;
