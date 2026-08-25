


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."create_file_dataset"("p_project_id" "uuid", "p_name" "text", "p_filename" "text", "p_description" "text" DEFAULT NULL::"text", "p_business_domain" "text" DEFAULT NULL::"text") RETURNS TABLE("dataset_id" "uuid", "dataset_version_id" "uuid", "data_source_id" "uuid", "version_number" bigint, "storage_bucket" "text", "storage_path" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'app', 'catalog', 'app_private'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_dataset_id uuid;
  v_source_id uuid;
  v_version_id uuid;
  v_version_number bigint;
  v_filename text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if not app_private.is_project_admin(p_project_id) then
    raise exception using errcode = '42501', message = 'Project administrator access required';
  end if;

  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 160 then
    raise exception using errcode = '22023', message = 'Dataset name must be 1-160 characters';
  end if;

  if p_filename is null or btrim(p_filename) = '' or length(p_filename) > 255 then
    raise exception using errcode = '22023', message = 'Filename is required and must be <=255 characters';
  end if;

  v_filename := regexp_replace(btrim(p_filename), '[^A-Za-z0-9._-]+', '_', 'g');

  insert into catalog.data_sources(project_id, name, source_type, connection_metadata, status)
  values (
    p_project_id,
    btrim(p_name) || ' upload',
    'FILE_UPLOAD',
    jsonb_build_object('storage_bucket','dataset-files'),
    'ACTIVE'
  )
  returning id into v_source_id;

  insert into catalog.datasets(
    project_id, data_source_id, name, description, source_identifier,
    owner_user_id, business_domain, status, metadata
  )
  values (
    p_project_id, v_source_id, btrim(p_name), nullif(btrim(coalesce(p_description,'')), ''),
    v_filename, v_user_id, nullif(btrim(coalesce(p_business_domain,'')), ''),
    'ACTIVE', jsonb_build_object('ingestion_type','FILE_UPLOAD')
  )
  returning id into v_dataset_id;

  select coalesce(max(version_number), 0) + 1
    into v_version_number
  from catalog.dataset_versions
  where dataset_id = v_dataset_id;

  insert into catalog.dataset_versions(
    dataset_id, version_number, source_uri, status, metadata
  )
  values (
    v_dataset_id,
    v_version_number,
    'supabase://dataset-files/' || p_project_id::text || '/' || v_dataset_id::text || '/' || v_version_number::text || '/' || v_filename,
    'PROCESSING',
    jsonb_build_object(
      'storage_bucket','dataset-files',
      'storage_path',p_project_id::text || '/' || v_dataset_id::text || '/' || v_version_number::text || '/' || v_filename,
      'original_filename',p_filename,
      'created_by',v_user_id
    )
  )
  returning id into v_version_id;

  return query
  select
    v_dataset_id,
    v_version_id,
    v_source_id,
    v_version_number,
    'dataset-files'::text,
    p_project_id::text || '/' || v_dataset_id::text || '/' || v_version_number::text || '/' || v_filename;
end;
$$;


ALTER FUNCTION "public"."create_file_dataset"("p_project_id" "uuid", "p_name" "text", "p_filename" "text", "p_description" "text", "p_business_domain" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "role" "app"."member_role")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'app', 'app_private'
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 120 then
    raise exception using errcode = '22023', message = 'Organization name must be 1-120 characters';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 63 then
    raise exception using errcode = '22023', message = 'Organization slug must be lowercase kebab-case';
  end if;

  insert into app.organizations(name, slug)
  values (btrim(p_name), p_slug)
  returning app.organizations.id into v_org_id;

  insert into app.organization_members(organization_id, user_id, role)
  values (v_org_id, v_user_id, 'OWNER');

  return query
  select o.id, o.name, o.slug, m.role
  from app.organizations o
  join app.organization_members m on m.organization_id = o.id
  where o.id = v_org_id and m.user_id = v_user_id;
end;
$_$;


ALTER FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_project"("p_organization_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "organization_id" "uuid", "name" "text", "slug" "text", "description" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'app', 'app_private'
    AS $_$
declare
  v_project_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if not app_private.is_org_admin(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organization administrator access required';
  end if;

  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 120 then
    raise exception using errcode = '22023', message = 'Project name must be 1-120 characters';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 63 then
    raise exception using errcode = '22023', message = 'Project slug must be lowercase kebab-case';
  end if;

  insert into app.projects(organization_id, name, slug, description)
  values (p_organization_id, btrim(p_name), p_slug, nullif(btrim(coalesce(p_description,'')), ''))
  returning app.projects.id into v_project_id;

  return query
  select p.id, p.organization_id, p.name, p.slug, p.description
  from app.projects p
  where p.id = v_project_id;
end;
$_$;


ALTER FUNCTION "public"."create_project"("p_organization_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_dataset_versions"("p_dataset_id" "uuid") RETURNS TABLE("id" "uuid", "dataset_id" "uuid", "version_number" bigint, "source_uri" "text", "content_hash" "text", "schema_hash" "text", "row_count" bigint, "column_count" integer, "size_bytes" bigint, "observed_at" timestamp with time zone, "status" "catalog"."dataset_version_status", "metadata" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'app', 'catalog'
    AS $$
  select v.id, v.dataset_id, v.version_number, v.source_uri, v.content_hash,
         v.schema_hash, v.row_count, v.column_count, v.size_bytes,
         v.observed_at, v.status, v.metadata, v.created_at
  from catalog.dataset_versions v
  join catalog.datasets d on d.id = v.dataset_id
  where v.dataset_id = p_dataset_id
    and app_private.is_project_member(d.project_id)
  order by v.version_number desc;
$$;


ALTER FUNCTION "public"."list_dataset_versions"("p_dataset_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_datasets"("p_project_id" "uuid") RETURNS TABLE("id" "uuid", "project_id" "uuid", "data_source_id" "uuid", "name" "text", "description" "text", "source_identifier" "text", "business_domain" "text", "status" "catalog"."dataset_status", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'app', 'catalog'
    AS $$
  select d.id, d.project_id, d.data_source_id, d.name, d.description,
         d.source_identifier, d.business_domain, d.status, d.created_at, d.updated_at
  from catalog.datasets d
  where d.project_id = p_project_id
    and app_private.is_project_member(p_project_id)
  order by d.created_at desc;
$$;


ALTER FUNCTION "public"."list_my_datasets"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_organizations"() RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "role" "app"."member_role")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'app'
    AS $$
  select o.id, o.name, o.slug, m.role
  from app.organizations o
  join app.organization_members m on m.organization_id = o.id
  where m.user_id = auth.uid()
  order by o.created_at asc;
$$;


ALTER FUNCTION "public"."list_my_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_projects"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "organization_id" "uuid", "name" "text", "slug" "text", "description" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'app'
    AS $$
  select p.id, p.organization_id, p.name, p.slug, p.description
  from app.projects p
  where p.organization_id = p_organization_id
    and app_private.is_org_member(p_organization_id)
  order by p.created_at asc;
$$;


ALTER FUNCTION "public"."list_my_projects"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_dataset_registry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_dataset_registry"() OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "sql_ro";



REVOKE ALL ON FUNCTION "public"."create_file_dataset"("p_project_id" "uuid", "p_name" "text", "p_filename" "text", "p_description" "text", "p_business_domain" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_file_dataset"("p_project_id" "uuid", "p_name" "text", "p_filename" "text", "p_description" "text", "p_business_domain" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_file_dataset"("p_project_id" "uuid", "p_name" "text", "p_filename" "text", "p_description" "text", "p_business_domain" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_project"("p_organization_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project"("p_organization_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_project"("p_organization_id" "uuid", "p_name" "text", "p_slug" "text", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_dataset_versions"("p_dataset_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_dataset_versions"("p_dataset_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_dataset_versions"("p_dataset_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_my_datasets"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_datasets"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_datasets"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_my_organizations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_organizations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_organizations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_my_projects"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_projects"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_projects"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_dataset_registry"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_dataset_registry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_dataset_registry"() TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "sql_ro";







