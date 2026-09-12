-- One authoritative governance issue identity per profiling finding.
-- Findings are globally unique UUIDs; the project boundary is separately enforced by FK/reference validation.
-- Existing production data was checked before this migration and contains no duplicate non-null finding_id values.

create unique index if not exists issues_finding_identity
  on governance.issues (finding_id)
  where finding_id is not null;
