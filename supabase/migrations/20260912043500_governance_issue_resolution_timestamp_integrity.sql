-- Keep governance issue terminal state and resolution chronology consistent even
-- for internal/service-role writers that bypass the application mutation path.

update governance.issues
set resolved_at = updated_at
where status in ('RESOLVED', 'CLOSED')
  and resolved_at is null;

update governance.issues
set resolved_at = null
where status not in ('RESOLVED', 'CLOSED')
  and resolved_at is not null;

alter table governance.issues
  drop constraint if exists issues_resolution_timestamp_consistency;

alter table governance.issues
  add constraint issues_resolution_timestamp_consistency
  check (
    (status in ('RESOLVED', 'CLOSED') and resolved_at is not null)
    or
    (status not in ('RESOLVED', 'CLOSED') and resolved_at is null)
  ) not valid;

alter table governance.issues
  validate constraint issues_resolution_timestamp_consistency;
