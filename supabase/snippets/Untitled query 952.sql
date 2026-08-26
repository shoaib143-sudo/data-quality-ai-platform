create table catalog.data_sources (
  id uuid not null default gen_random_uuid (),
  project_id uuid not null,
  name text not null,
  source_type text not null,
  connection_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint data_sources_pkey primary key (id),
  constraint data_sources_project_id_name_key unique (project_id, name),
  constraint data_sources_project_id_fkey foreign KEY (project_id) references app.projects (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_data_sources_project on catalog.data_sources using btree (project_id) TABLESPACE pg_default;

create trigger trg_source_updated_at BEFORE
update on catalog.data_sources for EACH row
execute FUNCTION app_private.set_updated_at ();