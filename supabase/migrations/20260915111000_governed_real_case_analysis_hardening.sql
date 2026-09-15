begin;

alter table governance.learning_case_assessments
  drop constraint if exists learning_case_assessments_case_unique;

alter table governance.learning_case_assessments
  add constraint learning_case_assessments_case_cutoff_unique
  unique (learning_case_id, evidence_cutoff_at);

alter table governance.learning_case_assessments
  add constraint learning_case_assessments_project_fkey
  foreign key (project_id) references app.projects(id) on delete cascade;

alter table governance.analysis_evidence_envelopes
  add constraint analysis_evidence_envelopes_project_fkey
  foreign key (project_id) references app.projects(id) on delete cascade;

create or replace function governance.enforce_learning_case_assessment_project_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, agent, governance
as $$
begin
  if not exists (
    select 1
    from agent.agent_learning_cases c
    where c.id = new.learning_case_id
      and c.project_id = new.project_id
  ) then
    raise exception 'Learning case assessment project scope does not match canonical learning case.';
  end if;

  return new;
end;
$$;

revoke all on function governance.enforce_learning_case_assessment_project_scope() from public;

create trigger trg_learning_case_assessment_project_scope
before insert or update of project_id, learning_case_id
on governance.learning_case_assessments
for each row
execute function governance.enforce_learning_case_assessment_project_scope();

comment on constraint learning_case_assessments_case_cutoff_unique on governance.learning_case_assessments is
  'Preserves reproducible as-of learning assessments. A later evidence cutoff creates a new assessment rather than overwriting prior historical state.';

comment on function governance.enforce_learning_case_assessment_project_scope() is
  'Fails closed when an assessment attempts to associate a canonical learning case with a different project.';

commit;
