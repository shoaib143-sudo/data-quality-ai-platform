create or replace function governance.verify_semantic_search_posture()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance,extensions
as $$
declare
  v_vector_extension boolean;
  v_table_exists boolean;
  v_rls_enabled boolean;
  v_hnsw_index boolean;
  v_match_function boolean;
  v_match_invoker boolean;
  v_auth_exec boolean;
  v_anon_exec boolean;
  v_select_policy_count integer;
  v_manage_policy_count integer;
  v_valid boolean;
begin
  select exists(select 1 from pg_extension where extname='vector') into v_vector_extension;
  select to_regclass('governance.semantic_embeddings') is not null into v_table_exists;

  select coalesce(c.relrowsecurity,false)
    into v_rls_enabled
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='governance' and c.relname='semantic_embeddings';
  v_rls_enabled := coalesce(v_rls_enabled,false);

  select exists(
    select 1
    from pg_indexes
    where schemaname='governance'
      and tablename='semantic_embeddings'
      and indexdef ilike '%using hnsw%'
  ) into v_hnsw_index;

  select exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='governance'
      and p.proname='match_semantic_embeddings'
  ) into v_match_function;

  select coalesce(not p.prosecdef,false),
         coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false),
         coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false)
    into v_match_invoker,v_auth_exec,v_anon_exec
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='governance'
    and p.proname='match_semantic_embeddings'
  limit 1;

  v_match_invoker := coalesce(v_match_invoker,false);
  v_auth_exec := coalesce(v_auth_exec,false);
  v_anon_exec := coalesce(v_anon_exec,false);

  select count(*) filter(where polcmd='r'),
         count(*) filter(where polcmd='*')
    into v_select_policy_count,v_manage_policy_count
  from pg_policy p
  join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='governance'
    and c.relname='semantic_embeddings';

  v_valid := v_vector_extension
    and v_table_exists
    and v_rls_enabled
    and v_hnsw_index
    and v_match_function
    and v_match_invoker
    and v_auth_exec
    and not v_anon_exec
    and v_select_policy_count=1
    and v_manage_policy_count=0;

  return jsonb_build_object(
    'valid',v_valid,
    'vector_extension',v_vector_extension,
    'semantic_table',v_table_exists,
    'rls_enabled',v_rls_enabled,
    'hnsw_index',v_hnsw_index,
    'match_function',v_match_function,
    'match_security_invoker',v_match_invoker,
    'authenticated_execute',v_auth_exec,
    'anonymous_execute',v_anon_exec,
    'select_policy_count',v_select_policy_count,
    'manage_policy_count',v_manage_policy_count
  );
end;
$$;

revoke execute on function governance.verify_semantic_search_posture() from public,anon,authenticated;
grant execute on function governance.verify_semantic_search_posture() to service_role;

select pg_notify('pgrst','reload schema');
