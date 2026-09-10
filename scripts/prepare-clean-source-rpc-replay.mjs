import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const fileName = '20260903225959_reconstruct_public_source_rpcs.sql'
const targetPath = path.join(targetDir, fileName)
if (fs.existsSync(targetPath)) throw new Error(`Replay source RPC reconstruction already exists: ${fileName}`)

const sql = `begin;

create or replace function public.create_organization(p_name text, p_slug text)
returns table(id uuid, name text, slug text, role app.member_role)
language plpgsql
security definer
set search_path = pg_catalog, public, app, app_private
as $function$
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
  insert into app.organizations(name, slug) values (btrim(p_name), p_slug)
  returning app.organizations.id into v_org_id;
  insert into app.organization_members(organization_id, user_id, role)
  values (v_org_id, v_user_id, 'OWNER');
  return query
  select o.id, o.name, o.slug, m.role
  from app.organizations o
  join app.organization_members m on m.organization_id = o.id
  where o.id = v_org_id and m.user_id = v_user_id;
end;
$function$;

create or replace function public.create_project(p_organization_id uuid, p_name text, p_slug text, p_description text default null::text)
returns table(id uuid, organization_id uuid, name text, slug text, description text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, app_private
as $function$
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
  from app.projects p where p.id = v_project_id;
end;
$function$;

create or replace function public.create_file_dataset(
  p_project_id uuid,
  p_name text,
  p_filename text,
  p_description text default null::text,
  p_business_domain text default null::text
)
returns table(dataset_id uuid, dataset_version_id uuid, data_source_id uuid, version_number bigint, storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, catalog, app_private
as $function$
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
  values (p_project_id, btrim(p_name) || ' upload', 'FILE_UPLOAD', jsonb_build_object('storage_bucket','dataset-files'), 'ACTIVE')
  returning id into v_source_id;
  insert into catalog.datasets(project_id, data_source_id, name, description, source_identifier, owner_user_id, business_domain, status, metadata)
  values (p_project_id, v_source_id, btrim(p_name), nullif(btrim(coalesce(p_description,'')), ''), v_filename, v_user_id,
    nullif(btrim(coalesce(p_business_domain,'')), ''), 'ACTIVE', jsonb_build_object('ingestion_type','FILE_UPLOAD'))
  returning id into v_dataset_id;
  select coalesce(max(version_number), 0) + 1 into v_version_number
  from catalog.dataset_versions where dataset_id = v_dataset_id;
  insert into catalog.dataset_versions(dataset_id, version_number, source_uri, status, metadata)
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
  ) returning id into v_version_id;
  return query select v_dataset_id, v_version_id, v_source_id, v_version_number, 'dataset-files'::text,
    p_project_id::text || '/' || v_dataset_id::text || '/' || v_version_number::text || '/' || v_filename;
end;
$function$;

create or replace function public.get_dataset_version_for_profiling(dataset_version_id uuid)
returns setof catalog.dataset_versions
language sql
security definer
set search_path = public
as $function$
  select * from catalog.dataset_versions where id = dataset_version_id;
$function$;

commit;
`

fs.writeFileSync(targetPath, sql)
console.log(`RECONSTRUCTED ${fileName}: released history hardens public source onboarding RPCs before their recorded creation; replay uses the live contracts.`)
