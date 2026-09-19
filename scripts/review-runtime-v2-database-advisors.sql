-- Runtime v2 Supabase advisor/index review helper.
-- Read-only evidence collection. This script intentionally performs no DDL/DML.

with targets(schema_name, table_name) as (
  values
    ('agent','governed_handoffs'),
    ('agent','governed_run_gates'),
    ('governance','agent_approval_authority_audit'),
    ('governance','governance_orchestrator_runs'),
    ('governance','governance_outcome_reports'),
    ('governance','orchestrator_autonomy_policies'),
    ('orchestration','governance_recovery_events')
)
select
  t.schema_name,
  t.table_name,
  has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'SELECT') as anon_select,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'DELETE') as authenticated_delete,
  has_table_privilege('service_role', format('%I.%I', t.schema_name, t.table_name), 'SELECT') as service_role_select
from targets t
order by 1, 2;

with indexes as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    i.indexrelid,
    ic.relname as index_name,
    i.indisunique,
    i.indisprimary,
    pg_get_indexdef(i.indexrelid) as index_definition,
    pg_get_expr(i.indpred, i.indrelid) as predicate
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_class ic on ic.oid = i.indexrelid
  where n.nspname not in ('pg_catalog', 'information_schema')
),
normalized as (
  select *, regexp_replace(index_definition, 'INDEX [^ ]+ ON ', 'INDEX <name> ON ') as normalized_definition
  from indexes
)
select
  a.schema_name,
  a.table_name,
  a.index_name as index_a,
  b.index_name as index_b
from normalized a
join normalized b
  on a.schema_name = b.schema_name
 and a.table_name = b.table_name
 and a.indexrelid < b.indexrelid
where a.indisunique = b.indisunique
  and a.indisprimary = b.indisprimary
  and a.normalized_definition = b.normalized_definition
  and coalesce(a.predicate, '') = coalesce(b.predicate, '')
order by 1, 2, 3;

select count(*)::int as indexes_with_zero_observed_scans
from pg_stat_user_indexes
where idx_scan = 0;
