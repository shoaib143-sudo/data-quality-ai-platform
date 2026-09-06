-- Integrate project-scoped source operational-readiness consistency into the
-- non-lineage enterprise acceptance contract without changing lifecycle authority.
--
-- Preserve the existing acceptance implementation unchanged as an internal base.
-- The wrapper adds only the project-scoped readiness evidence prerequisite and
-- embeds that evidence in the returned catalog payload. UNOBSERVED sources remain
-- valid when their discovery evidence is internally consistent.

alter function governance.verify_non_lineage_enterprise_acceptance(uuid)
  rename to verify_non_lineage_enterprise_acceptance_base;

revoke all on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) from public;
revoke execute on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) from anon, authenticated;
grant execute on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) to service_role;

comment on function governance.verify_non_lineage_enterprise_acceptance_base(uuid) is
  'Internal service-only base verifier for non-lineage enterprise acceptance. The public acceptance contract additionally requires project-scoped source operational-readiness evidence consistency.';

create function governance.verify_non_lineage_enterprise_acceptance(
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_base jsonb := governance.verify_non_lineage_enterprise_acceptance_base(p_project_id);
  v_source_readiness jsonb := catalog.verify_project_source_operational_readiness(p_project_id);
  v_valid boolean := false;
  v_result jsonb;
begin
  v_valid :=
    coalesce((v_base->>'valid')::boolean, false)
    and coalesce((v_source_readiness->>'valid')::boolean, false);

  v_result := jsonb_set(
    jsonb_set(
      jsonb_set(
        v_base,
        '{catalog,source_operational_readiness}',
        v_source_readiness,
        true
      ),
      '{valid}',
      to_jsonb(v_valid),
      true
    ),
    '{state}',
    to_jsonb(case
      when v_valid then 'NON_LINEAGE_ENTERPRISE_ACCEPTANCE_PASSED'
      else 'NON_LINEAGE_ENTERPRISE_ACCEPTANCE_INCOMPLETE'
    end),
    true
  );

  return v_result;
end;
$$;

revoke all on function governance.verify_non_lineage_enterprise_acceptance(uuid) from public;
revoke execute on function governance.verify_non_lineage_enterprise_acceptance(uuid) from anon, authenticated;
grant execute on function governance.verify_non_lineage_enterprise_acceptance(uuid) to service_role;

comment on function governance.verify_non_lineage_enterprise_acceptance(uuid) is
  'Service-only enterprise acceptance verifier for Modules #1, #2 and #4-#15. Requires project-scoped source operational-readiness evidence consistency without requiring all configured sources to be observed. Module #3 remains explicitly external-blocked and is never inferred or counted as complete.';