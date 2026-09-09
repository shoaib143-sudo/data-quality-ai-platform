create or replace function governance.record_human_retrieval_relevance_case(
  p_project_id uuid,
  p_case_key text,
  p_query_text text,
  p_evidence_refs text[],
  p_judgments jsonb,
  p_reviewer_user_id uuid,
  p_reviewer_capability text default 'admin.manage'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_version_id uuid;
  v_judgment jsonb;
  v_object_key text;
  v_relevance integer;
  v_positive_count integer := 0;
begin
  if p_project_id is null or not exists (select 1 from app.projects where id = p_project_id) then
    raise exception 'RETRIEVAL_LABEL_PROJECT_REQUIRED';
  end if;
  if p_reviewer_user_id is null or not exists (select 1 from auth.users where id = p_reviewer_user_id) then
    raise exception 'RETRIEVAL_LABEL_REVIEWER_REQUIRED';
  end if;
  if length(btrim(coalesce(p_case_key, ''))) = 0 then
    raise exception 'RETRIEVAL_LABEL_CASE_KEY_REQUIRED';
  end if;
  if length(btrim(coalesce(p_query_text, ''))) = 0 then
    raise exception 'RETRIEVAL_LABEL_QUERY_REQUIRED';
  end if;
  if p_evidence_refs is null or cardinality(p_evidence_refs) = 0 then
    raise exception 'RETRIEVAL_LABEL_EVIDENCE_REQUIRED';
  end if;
  if exists (select 1 from unnest(p_evidence_refs) ref where length(btrim(coalesce(ref, ''))) = 0) then
    raise exception 'RETRIEVAL_LABEL_EVIDENCE_INVALID';
  end if;
  if length(btrim(coalesce(p_reviewer_capability, ''))) = 0 then
    raise exception 'RETRIEVAL_LABEL_REVIEWER_CAPABILITY_REQUIRED';
  end if;
  if p_judgments is null or jsonb_typeof(p_judgments) <> 'array' or jsonb_array_length(p_judgments) = 0 then
    raise exception 'RETRIEVAL_LABEL_JUDGMENTS_REQUIRED';
  end if;

  for v_judgment in select value from jsonb_array_elements(p_judgments)
  loop
    if jsonb_typeof(v_judgment) <> 'object' then
      raise exception 'RETRIEVAL_LABEL_JUDGMENT_INVALID';
    end if;
    v_object_key := btrim(coalesce(v_judgment ->> 'object_key', ''));
    if length(v_object_key) = 0 then
      raise exception 'RETRIEVAL_LABEL_OBJECT_KEY_REQUIRED';
    end if;
    begin
      v_relevance := (v_judgment ->> 'relevance')::integer;
    exception when others then
      raise exception 'RETRIEVAL_LABEL_RELEVANCE_INVALID';
    end;
    if v_relevance < 0 then
      raise exception 'RETRIEVAL_LABEL_RELEVANCE_INVALID';
    end if;
    if v_relevance > 0 then v_positive_count := v_positive_count + 1; end if;
  end loop;

  if v_positive_count = 0 then
    raise exception 'RETRIEVAL_LABEL_POSITIVE_JUDGMENT_REQUIRED';
  end if;

  insert into governance.ai_retrieval_evaluation_case_versions (
    project_id, case_key, query_text, authority, evidence_refs,
    reviewer_user_id, reviewer_capability, reviewed_at
  ) values (
    p_project_id, btrim(p_case_key), btrim(p_query_text), 'HUMAN_REVIEWED', p_evidence_refs,
    p_reviewer_user_id, btrim(p_reviewer_capability), now()
  ) returning id into v_case_version_id;

  for v_judgment in select value from jsonb_array_elements(p_judgments)
  loop
    insert into governance.ai_retrieval_relevance_judgments (
      project_id, case_version_id, object_key, relevance
    ) values (
      p_project_id,
      v_case_version_id,
      btrim(v_judgment ->> 'object_key'),
      (v_judgment ->> 'relevance')::integer
    );
  end loop;

  return v_case_version_id;
end;
$$;

revoke all on function governance.record_human_retrieval_relevance_case(uuid,text,text,text[],jsonb,uuid,text) from public;
revoke all on function governance.record_human_retrieval_relevance_case(uuid,text,text,text[],jsonb,uuid,text) from authenticated;
grant execute on function governance.record_human_retrieval_relevance_case(uuid,text,text,text[],jsonb,uuid,text) to service_role;

comment on function governance.record_human_retrieval_relevance_case(uuid,text,text,text[],jsonb,uuid,text) is 'Atomically records explicit HUMAN_REVIEWED retrieval relevance evidence. Service-role execution only; caller authorization is enforced by the application before invocation. This function grants no model approval, activation, promotion, or deployment authority.';
