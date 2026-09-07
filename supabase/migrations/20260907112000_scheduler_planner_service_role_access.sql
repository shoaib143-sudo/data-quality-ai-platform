grant select on table orchestration.job_dependencies to service_role;
grant select on table orchestration.source_concurrency_state to service_role;

comment on table orchestration.job_dependencies is
  'Structural orchestration dependencies between durable jobs. Service-role SELECT is required by the trusted scheduler planner only. These edges are not source-observed data lineage or transformation lineage.';

comment on table orchestration.source_concurrency_state is
  'Adaptive scheduler control state keyed by stable source identity. Service-role SELECT is required by the trusted scheduler planner only. This table controls execution concurrency and is not governance authority or source metadata.';
