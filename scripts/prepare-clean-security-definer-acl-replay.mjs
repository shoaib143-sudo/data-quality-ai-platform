import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')

const filename = '20260915163959_reconcile_security_definer_acl.sql'
const sql = `-- Disposable clean-replay reconciliation only.
-- Production already has zero unexpected authenticated-callable SECURITY DEFINER
-- functions in DataNexus application schemas. Released Git history predates several
-- ACL revocations, so clean replay restores that verified production boundary
-- before the canonical allowlist assertion runs.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app', 'app_private', 'agent', 'catalog', 'profiling', 'governance', 'orchestration')
      and p.prosecdef = true
      and not (
        n.nspname = 'app_private'
        and p.proname in ('is_org_admin', 'is_org_member', 'is_project_admin', 'is_project_member')
        and pg_get_function_identity_arguments(p.oid) in ('p_org_id uuid', 'p_project_id uuid')
      )
      and not (
        n.nspname = 'agent'
        and p.proname = 'resolve_runtime_interrupt'
        and pg_get_function_identity_arguments(p.oid) = 'p_interrupt_id uuid, p_decision text, p_action_payload_hash text, p_response jsonb'
      )
      and not (
        n.nspname = 'orchestration'
        and p.proname = 'request_execution_recovery_action_admin'
        and pg_get_function_identity_arguments(p.oid) = 'p_case_id uuid, p_action text'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.identity);
  end loop;
end
$$;
`

fs.writeFileSync(path.join(targetDir, filename), sql)
console.log(`RECONSTRUCTED ${filename}: clean released-history replay restores the verified production browser ACL boundary for all non-allowlisted SECURITY DEFINER functions before the authenticated allowlist assertion.`)
