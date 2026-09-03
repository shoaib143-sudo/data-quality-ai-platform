alter role authenticator set pgrst.db_schemas = 'public, graphql_public, app, agent, catalog, profiling, governance, orchestration';

grant usage on schema governance, orchestration to anon, authenticated, service_role;

select pg_notify('pgrst','reload config');
select pg_notify('pgrst','reload schema');
