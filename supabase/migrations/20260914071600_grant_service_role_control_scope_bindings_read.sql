-- Job Monitor governed domain context is loaded through an already-authorized
-- server boundary using the service role. The control scope binding table was
-- the only posture dependency missing the explicit service_role SELECT grant.
-- Keep the grant read-only and table-specific; mutation authority is unchanged.

grant select on table governance.control_scope_bindings to service_role;
