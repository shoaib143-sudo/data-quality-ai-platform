-- PL/pgSQL variable names must not shadow ON CONFLICT index columns.
do $fix$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='catalog' and p.proname='publish_discovery_revision';
  if d is null then raise exception 'catalog.publish_discovery_revision was not found'; end if;
  d:=replace(d,'; evidence_kind text;','; v_evidence_kind text;');
  d:=replace(d,'; evidence_kind:=case','; v_evidence_kind:=case');
  d:=replace(d,'),evidence_kind,immutable,','),v_evidence_kind,immutable,');
  d:=replace(d,'''identity_evidence'',evidence_kind','''identity_evidence'',v_evidence_kind');
  if position(' evidence_kind text;' in d)>0 or position('; evidence_kind:=case' in d)>0 or position('),evidence_kind,immutable,' in d)>0 or position('''identity_evidence'',evidence_kind' in d)>0 then
    raise exception 'Identity evidence variable replacement was incomplete';
  end if;
  execute d;
end $fix$;
