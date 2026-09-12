\set ON_ERROR_STOP on

-- This suite runs after scripts/test-project-profile-readiness.sql in the same
-- isolated PostgreSQL database and reuses its governed readiness fixtures.
create table if not exists profiling.profile_runs (
  id uuid primary key,
  dataset_version_id uuid not null,
  status text not null default 'RUNNING'
);

\ir ../supabase/migrations/20260912174600_project_profile_readiness_admission_gate.sql

-- READY latest dataset version is admitted.
insert into profiling.profile_runs(id,dataset_version_id,status) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000015','RUNNING');

-- Old dataset version must be rejected by the DB admission backstop.
do $$
begin
  begin
    insert into profiling.profile_runs(id,dataset_version_id,status) values
    ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000019','RUNNING');
    raise exception 'old dataset version was unexpectedly admitted';
  exception
    when check_violation then
      if position('PROFILE_READINESS_GATE_BLOCKED' in sqlerrm) = 0 then raise; end if;
  end;
end
$$;

-- A currently blocked latest version must be rejected.
update catalog.datasets set status='INACTIVE' where id='00000000-0000-0000-0000-000000000011';
do $$
begin
  begin
    insert into profiling.profile_runs(id,dataset_version_id,status) values
    ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000015','RUNNING');
    raise exception 'blocked dataset was unexpectedly admitted';
  exception
    when check_violation then
      if position('PROFILE_READINESS_GATE_BLOCKED' in sqlerrm) = 0 then raise; end if;
  end;
end
$$;
update catalog.datasets set status='ACTIVE' where id='00000000-0000-0000-0000-000000000011';

-- A non-onboarded source type is NOT_ASSESSED and must be rejected.
insert into catalog.dataset_versions(id,dataset_id,version_number,created_at) values
('00000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000021',1,now());
do $$
begin
  begin
    insert into profiling.profile_runs(id,dataset_version_id,status) values
    ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000025','RUNNING');
    raise exception 'NOT_ASSESSED dataset was unexpectedly admitted';
  exception
    when check_violation then
      if position('PROFILE_READINESS_GATE_BLOCKED' in sqlerrm) = 0 then raise; end if;
  end;
end
$$;

-- Unknown dataset version is rejected without creating a run.
do $$
begin
  begin
    insert into profiling.profile_runs(id,dataset_version_id,status) values
    ('10000000-0000-0000-0000-000000000005','ffffffff-ffff-ffff-ffff-ffffffffffff','RUNNING');
    raise exception 'unknown dataset version was unexpectedly admitted';
  exception
    when check_violation then
      if position('PROFILE_READINESS_DATASET_VERSION_NOT_FOUND' in sqlerrm) = 0 then raise; end if;
  end;
end
$$;

-- The rejected attempts did not create durable profile runs.
do $$
declare c integer;
begin
  select count(*) into c from profiling.profile_runs;
  if c <> 1 then raise exception 'expected exactly one admitted READY profile run, got %', c; end if;
end
$$;

select 'profile readiness admission guard tests passed' as result;
