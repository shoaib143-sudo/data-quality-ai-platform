alter table governance.lineage_transformations
  add constraint lineage_transformations_project_id_id_key unique (project_id, id);

alter table governance.lineage_edges
  drop constraint lineage_edges_transformation_id_fkey;

alter table governance.lineage_edges
  add constraint lineage_edges_project_transformation_fkey
  foreign key (project_id, transformation_id)
  references governance.lineage_transformations (project_id, id)
  on delete set null (transformation_id);

alter table governance.lineage_edges
  drop constraint lineage_edges_source_type_source_id_target_type_target_id_r_key;
