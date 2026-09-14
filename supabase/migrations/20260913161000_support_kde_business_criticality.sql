-- Extend the existing governed critical-element model to represent both CDE and KDE.

alter table governance.critical_data_elements
  add column if not exists element_type text not null default 'CDE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'critical_data_elements_element_type_check'
      and conrelid = 'governance.critical_data_elements'::regclass
  ) then
    alter table governance.critical_data_elements
      add constraint critical_data_elements_element_type_check
      check (element_type in ('CDE','KDE'));
  end if;
end $$;

create index if not exists idx_critical_data_elements_element_type
  on governance.critical_data_elements(project_id, element_type, domain, status);

comment on column governance.critical_data_elements.element_type is
  'Business criticality designation used by Agent Policy v2 risk evaluation: CDE or KDE.';
