update governance.access_roles
set capabilities = case
  when 'agent.execute' = any(capabilities) then capabilities
  else array_append(capabilities, 'agent.execute')
end
where role_key in ('DATA_OWNER','DATA_STEWARD','QUALITY_MANAGER','POLICY_APPROVER');
