alter table governance.audit_events drop constraint if exists audit_events_project_id_fkey;
alter table governance.audit_events drop constraint if exists audit_events_actor_user_id_fkey;

comment on column governance.audit_events.project_id is
'Immutable historical project identifier. Deliberately not foreign-keyed so deleting a governed project never rewrites audit history.';
comment on column governance.audit_events.actor_user_id is
'Immutable historical actor identifier. Deliberately not foreign-keyed so identity deletion never rewrites audit history.';
