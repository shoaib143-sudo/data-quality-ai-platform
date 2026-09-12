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

-- Issue mutations are server-authoritative. API routes enforce `issues.manage`
-- before service-role writes; direct authenticated table writes would otherwise
-- bypass that capability boundary because the historical RLS policy used ALL.
revoke insert, update, delete, truncate, references, trigger
  on table governance.issues
  from authenticated;
grant select on table governance.issues to authenticated;

drop policy if exists issues_project_access on governance.issues;
drop policy if exists issues_project_read on governance.issues;
create policy issues_project_read
  on governance.issues
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

-- Comments use the same governed mutation boundary. In particular, direct INSERT
-- previously allowed a project member without `issues.manage` to create comments
-- (and choose user_id/evidence) outside the authorized API path.
revoke insert, update, delete, truncate, references, trigger
  on table governance.issue_comments
  from authenticated;
grant select on table governance.issue_comments to authenticated;

drop policy if exists issue_comments_project_access on governance.issue_comments;
drop policy if exists issue_comments_project_read on governance.issue_comments;
create policy issue_comments_project_read
  on governance.issue_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from governance.issues i
      where i.id = issue_comments.issue_id
        and app_private.is_project_member(i.project_id)
    )
  );
