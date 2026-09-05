create or replace function catalog.create_asset_promotion_request(p_source_id uuid,p_identity_key text,p_actor uuid,p_rationale text default null)
returns uuid language plpgsql security definer set search_path=catalog,public as $$
declare v_source catalog.data_sources%rowtype; v_asset catalog.discovered_assets%rowtype; v_existing catalog.asset_promotion_requests%rowtype; v_id uuid;
begin
  if p_actor is null then raise exception 'Human actor is required'; end if;
  select * into v_source from catalog.data_sources where id=p_source_id;
  if not found then raise exception 'Source not found'; end if;
  select * into v_asset from catalog.discovered_assets where source_id=p_source_id and identity_key=p_identity_key and is_current order by last_seen_at desc limit 1;
  if not found then raise exception 'Current discovered asset not found'; end if;
  select * into v_existing from catalog.asset_promotion_requests where source_id=p_source_id and identity_key=p_identity_key and status in ('RECOMMENDED','REQUESTED','APPROVED') order by updated_at desc limit 1 for update;
  if found then
    if v_existing.status='RECOMMENDED' then
      update catalog.asset_promotion_requests set status='REQUESTED',requested_by=p_actor,requested_at=now(),rationale=coalesce(p_rationale,rationale),updated_at=now() where id=v_existing.id returning id into v_id;
    else
      v_id:=v_existing.id;
    end if;
  else
    insert into catalog.asset_promotion_requests(project_id,source_id,identity_key,discovered_asset_id,status,recommendation_source,rationale,requested_by,requested_at)
    values(v_source.project_id,p_source_id,p_identity_key,v_asset.id,'REQUESTED','HUMAN',p_rationale,p_actor,now()) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function catalog.create_asset_promotion_request(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function catalog.create_asset_promotion_request(uuid,text,uuid,text) to service_role;
