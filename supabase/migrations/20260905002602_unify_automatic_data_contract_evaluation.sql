-- Alignment migration for the final automatic/rich data-contract evaluator state.
-- The function bodies were introduced by the earlier evaluator lifecycle migrations;
-- this migration reasserts the production execution boundary and documents the
-- intended automatic profile-completion behavior.

revoke all on function governance.evaluate_data_contract_for_contract(uuid, uuid) from public, anon, authenticated;
revoke all on function governance.evaluate_data_contract(uuid) from public, anon, authenticated;

grant execute on function governance.evaluate_data_contract_for_contract(uuid, uuid) to service_role;
grant execute on function governance.evaluate_data_contract(uuid) to service_role;

comment on function governance.evaluate_data_contract_for_contract(uuid, uuid) is
  'Evaluates the active version of a specific data contract against completed profiling evidence, including schema, freshness, row-count, quality, critical-column and nested column metric requirements.';

comment on function governance.evaluate_data_contract(uuid) is
  'Automatic profile-completion contract evaluator. Delegates to the richer contract-specific evaluator and manages contract alerts/certification invalidation.';
