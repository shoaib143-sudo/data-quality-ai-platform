-- Forward-only completion of composite foreign-key coverage reported by the
-- live Supabase advisor after deploying governed experiment budgets.
create index if not exists learning_experiment_budget_policy_project_fk_idx
  on agent.learning_experiment_budget_reservations(policy_id, project_id);
create index if not exists learning_experiment_budget_reservation_project_fk_idx
  on agent.learning_experiment_budget_settlements(reservation_id, project_id);
