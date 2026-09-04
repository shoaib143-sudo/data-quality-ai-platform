insert into storage.buckets (id, name, public)
values ('governance-artifacts', 'governance-artifacts', false)
on conflict (id) do update set public = false;
