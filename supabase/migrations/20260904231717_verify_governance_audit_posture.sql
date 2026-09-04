create or replace function governance.verify_governance_audit_posture()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_table_insert boolean;
  v_sequence_usage boolean;
  v_sequence_select boolean;
  v_append_only_trigger boolean;
  v_hash_chain_trigger boolean;
begin
  v_table_insert := has_table_privilege('service_role', 'governance.audit_events', 'INSERT');
  v_sequence_usage := has_sequence_privilege('service_role', 'governance.audit_event_chain_sequence', 'USAGE');
  v_sequence_select := has_sequence_privilege('service_role', 'governance.audit_event_chain_sequence', 'SELECT');

  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal
      and n.nspname='governance'
      and c.relname='audit_events'
      and t.tgname='audit_events_append_only'
      and t.tgenabled <> 'D'
  ) into v_append_only_trigger;

  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal
      and n.nspname='governance'
      and c.relname='audit_events'
      and t.tgname='audit_events_hash_chain'
      and t.tgenabled <> 'D'
  ) into v_hash_chain_trigger;

  return jsonb_build_object(
    'valid', v_table_insert and v_sequence_usage and v_sequence_select and v_append_only_trigger and v_hash_chain_trigger,
    'service_role_table_insert', v_table_insert,
    'service_role_sequence_usage', v_sequence_usage,
    'service_role_sequence_select', v_sequence_select,
    'append_only_trigger', v_append_only_trigger,
    'hash_chain_trigger', v_hash_chain_trigger
  );
end;
$$;

revoke all on function governance.verify_governance_audit_posture() from public;
revoke all on function governance.verify_governance_audit_posture() from anon;
revoke all on function governance.verify_governance_audit_posture() from authenticated;
grant execute on function governance.verify_governance_audit_posture() to service_role;
