-- Cover the pricing_version_id foreign key used by canonical AI cost accounting.
-- Partial because unpriced events intentionally have no pricing version.

create index if not exists ai_model_cost_events_pricing_version_idx
  on governance.ai_model_cost_events (pricing_version_id)
  where pricing_version_id is not null;
