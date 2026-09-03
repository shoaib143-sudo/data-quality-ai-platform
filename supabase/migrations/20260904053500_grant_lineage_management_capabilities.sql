update governance.access_roles
set capabilities = case when 'lineage.manage'=any(capabilities) then capabilities else array_append(capabilities,'lineage.manage') end
where role_key in ('DATA_STEWARD','DATA_OWNER');

select pg_notify('pgrst','reload schema');
