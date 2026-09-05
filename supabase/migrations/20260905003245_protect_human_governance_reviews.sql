create or replace function governance.protect_classification_human_review()
returns trigger
language plpgsql
set search_path=pg_catalog,governance
as $$
begin
  if old.reviewed_at is not null
     and old.status in ('APPROVED','REJECTED')
     and new.status='SUGGESTED' then
    new.status := old.status;
    new.approved_by := old.approved_by;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
    if old.evidence ? 'review' then
      new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object('review',old.evidence->'review');
    end if;
  end if;
  return new;
end;
$$;

create or replace function governance.protect_cde_human_review()
returns trigger
language plpgsql
set search_path=pg_catalog,governance
as $$
begin
  if old.reviewed_at is not null
     and old.status in ('APPROVED','REJECTED')
     and new.status='SUGGESTED' then
    new.status := old.status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
    if old.evidence ? 'review' then
      new.evidence := coalesce(new.evidence,'{}'::jsonb) || jsonb_build_object('review',old.evidence->'review');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_classification_human_review on governance.dataset_classifications;
create trigger trg_protect_classification_human_review
before update on governance.dataset_classifications
for each row execute function governance.protect_classification_human_review();

drop trigger if exists trg_protect_cde_human_review on governance.cde_mappings;
create trigger trg_protect_cde_human_review
before update on governance.cde_mappings
for each row execute function governance.protect_cde_human_review();

revoke all on function governance.protect_classification_human_review() from public,anon,authenticated,service_role;
revoke all on function governance.protect_cde_human_review() from public,anon,authenticated,service_role;
