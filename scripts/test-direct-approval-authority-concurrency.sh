#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL is required}"

ACTOR_ID='11111111-1111-4111-8111-111111111111'
SUBJECT_ID='22222222-2222-4222-8222-222222222222'
ORG_ID='33333333-3333-4333-8333-333333333333'
PROJECT_ID='44444444-4444-4444-8444-444444444444'
EXPIRED_SUBJECT_ID='55555555-5555-4555-8555-555555555555'

cleanup() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>&1 || true
DELETE FROM app.organizations WHERE id = '$ORG_ID'::uuid;
DELETE FROM auth.users WHERE id IN ('$ACTOR_ID'::uuid, '$SUBJECT_ID'::uuid, '$EXPIRED_SUBJECT_ID'::uuid);
SQL
}
trap cleanup EXIT
cleanup

psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES
  ('$ACTOR_ID'::uuid,'authenticated','authenticated','authority-concurrency-actor@example.invalid',now(),now()),
  ('$SUBJECT_ID'::uuid,'authenticated','authenticated','authority-concurrency-subject@example.invalid',now(),now()),
  ('$EXPIRED_SUBJECT_ID'::uuid,'authenticated','authenticated','authority-expiry-subject@example.invalid',now(),now());

INSERT INTO app.organizations(id,name,slug,metadata)
VALUES ('$ORG_ID'::uuid,'Direct authority concurrency matrix','direct-authority-concurrency',jsonb_build_object('synthetic',true));

INSERT INTO app.organization_members(organization_id,user_id,role) VALUES
  ('$ORG_ID'::uuid,'$ACTOR_ID'::uuid,'OWNER'),
  ('$ORG_ID'::uuid,'$SUBJECT_ID'::uuid,'MEMBER'),
  ('$ORG_ID'::uuid,'$EXPIRED_SUBJECT_ID'::uuid,'MEMBER');

INSERT INTO app.projects(id,organization_id,name,slug,metadata)
VALUES ('$PROJECT_ID'::uuid,'$ORG_ID'::uuid,'Direct authority concurrency matrix','direct-authority-concurrency',jsonb_build_object('synthetic',true));

INSERT INTO governance.critical_data_elements(project_id,cde_key,name,definition,domain,metadata)
VALUES ('$PROJECT_ID'::uuid,'runtime-concurrency-cde','Runtime concurrency CDE','Synthetic CDE for concurrent approval authority testing','Product',jsonb_build_object('synthetic',true));
SQL

assign_sql="select (governance.assign_agent_approval_authority('$ACTOR_ID'::uuid,'$SUBJECT_ID'::uuid,'$PROJECT_ID'::uuid,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'concurrent assignment')).id;"

out1="$(mktemp)"
out2="$(mktemp)"
trap 'rm -f "$out1" "$out2"; cleanup' EXIT

set +e
psql "$DB_URL" -v ON_ERROR_STOP=1 -Atc "$assign_sql" >"$out1" 2>&1 &
pid1=$!
psql "$DB_URL" -v ON_ERROR_STOP=1 -Atc "$assign_sql" >"$out2" 2>&1 &
pid2=$!
wait "$pid1"; rc1=$?
wait "$pid2"; rc2=$?
set -e

if [[ "$rc1" -eq 0 && "$rc2" -eq 0 ]]; then
  echo 'Both concurrent authority assignments succeeded; expected one duplicate rejection.' >&2
  cat "$out1" >&2
  cat "$out2" >&2
  exit 1
fi
if [[ "$rc1" -ne 0 && "$rc2" -ne 0 ]]; then
  echo 'Both concurrent authority assignments failed; expected exactly one success.' >&2
  cat "$out1" >&2
  cat "$out2" >&2
  exit 1
fi

failure_output="$out1"
if [[ "$rc1" -eq 0 ]]; then failure_output="$out2"; fi
if ! grep -Fq 'overlapping direct approval authority already exists' "$failure_output"; then
  echo 'Concurrent loser did not fail with the governed duplicate-overlap rejection.' >&2
  cat "$failure_output" >&2
  exit 1
fi

read -r active_count audit_count < <(
  psql "$DB_URL" -v ON_ERROR_STOP=1 -AtF ' ' -c "
    select
      (select count(*) from governance.agent_approval_authorities
       where user_id = '$SUBJECT_ID'::uuid
         and project_id = '$PROJECT_ID'::uuid
         and lower(domain) = 'product'
         and approval_axis = 'BUSINESS'
         and active = true),
      (select count(*) from governance.agent_approval_authority_audit
       where subject_user_id = '$SUBJECT_ID'::uuid
         and project_id = '$PROJECT_ID'::uuid
         and lower(domain) = 'product'
         and approval_axis = 'BUSINESS'
         and event_type = 'ASSIGNED');"
)

if [[ "$active_count" != '1' || "$audit_count" != '1' ]]; then
  echo "Concurrent authority assignment produced active_count=$active_count audit_count=$audit_count; expected 1 and 1." >&2
  exit 1
fi

# Prove that a historical authority which has expired does not block a later
# same-axis assignment for the same governed scope. This is a lifecycle
# regression test for temporal reassignment, not an upsert or mutation of the
# historical evidence row.
psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
select (governance.assign_agent_approval_authority(
  '$ACTOR_ID'::uuid,
  '$EXPIRED_SUBJECT_ID'::uuid,
  '$PROJECT_ID'::uuid,
  'Product',
  'BUSINESS',
  array['RUN_PROFILING'],
  'LOW',
  now() - interval '2 days',
  now() - interval '1 day',
  'expired lifecycle authority'
)).id;

select (governance.assign_agent_approval_authority(
  '$ACTOR_ID'::uuid,
  '$EXPIRED_SUBJECT_ID'::uuid,
  '$PROJECT_ID'::uuid,
  'Product',
  'BUSINESS',
  array['RUN_PROFILING'],
  'MEDIUM',
  now(),
  null,
  'replacement lifecycle authority'
)).id;
SQL

read -r lifecycle_count lifecycle_active lifecycle_audit < <(
  psql "$DB_URL" -v ON_ERROR_STOP=1 -AtF ' ' -c "
    select
      (select count(*) from governance.agent_approval_authorities
       where user_id = '$EXPIRED_SUBJECT_ID'::uuid
         and project_id = '$PROJECT_ID'::uuid
         and lower(domain) = 'product'
         and approval_axis = 'BUSINESS'),
      case when governance.is_agent_approval_authority(
        '$EXPIRED_SUBJECT_ID'::uuid,
        '$PROJECT_ID'::uuid,
        'Product',
        'BUSINESS',
        'RUN_PROFILING',
        'MEDIUM'
      ) then 1 else 0 end,
      (select count(*) from governance.agent_approval_authority_audit
       where subject_user_id = '$EXPIRED_SUBJECT_ID'::uuid
         and project_id = '$PROJECT_ID'::uuid
         and lower(domain) = 'product'
         and approval_axis = 'BUSINESS'
         and event_type = 'ASSIGNED');"
)

if [[ "$lifecycle_count" != '2' || "$lifecycle_active" != '1' || "$lifecycle_audit" != '2' ]]; then
  echo "Authority lifecycle reassignment produced rows=$lifecycle_count active=$lifecycle_active audit=$lifecycle_audit; expected 2, 1, 2." >&2
  exit 1
fi

# Audit evidence is service-side evidence. Verify the reconstructed database
# has RLS enabled and no browser/public table grants, while service_role retains
# the access needed by governed backend operations.
read -r audit_rls browser_grants service_select service_insert < <(
  psql "$DB_URL" -v ON_ERROR_STOP=1 -AtF ' ' -c "
    select
      case when (select c.relrowsecurity
                 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'governance'
                   and c.relname = 'agent_approval_authority_audit') then 1 else 0 end,
      (select count(*)
       from information_schema.role_table_grants
       where table_schema = 'governance'
         and table_name = 'agent_approval_authority_audit'
         and grantee in ('PUBLIC','anon','authenticated')),
      case when has_table_privilege('service_role','governance.agent_approval_authority_audit','SELECT') then 1 else 0 end,
      case when has_table_privilege('service_role','governance.agent_approval_authority_audit','INSERT') then 1 else 0 end;"
)

if [[ "$audit_rls" != '1' || "$browser_grants" != '0' || "$service_select" != '1' || "$service_insert" != '1' ]]; then
  echo "Authority audit boundary failed: rls=$audit_rls browser_grants=$browser_grants service_select=$service_select service_insert=$service_insert." >&2
  exit 1
fi

echo 'Concurrent direct approval authority assignment, temporal reassignment, and audit boundary contracts verified.'
