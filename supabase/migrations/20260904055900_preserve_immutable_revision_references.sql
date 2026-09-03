alter table governance.object_revisions drop constraint if exists object_revisions_project_id_fkey;
alter table governance.object_revisions drop constraint if exists object_revisions_changed_by_fkey;

comment on column governance.object_revisions.project_id is
'Immutable historical project identifier. Deliberately not foreign-keyed so deleting a governed project never rewrites or deletes revision history.';
comment on column governance.object_revisions.changed_by is
'Immutable historical actor identifier. Deliberately not foreign-keyed so deleting an identity never rewrites revision history.';
