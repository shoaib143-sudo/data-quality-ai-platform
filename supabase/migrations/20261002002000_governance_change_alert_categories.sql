begin;

alter table profiling.observability_alerts
  drop constraint if exists observability_alerts_category_check;

alter table profiling.observability_alerts
  add constraint observability_alerts_category_check
  check (category in (
    'QUALITY_SCORE_DROP',
    'SCHEMA_DRIFT',
    'VOLUME_CHANGE',
    'QUALITY_RULE_FAILURE',
    'PROFILE_FAILURE',
    'FRESHNESS',
    'METADATA_CHANGE',
    'LINEAGE_CHANGE'
  ));

comment on constraint observability_alerts_category_check on profiling.observability_alerts is
  'Operational and governed-change alert categories used by durable stakeholder notification routing.';

select pg_notify('pgrst','reload schema');
commit;
