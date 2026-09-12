# Native runtime interrupt lifecycle security boundaries

Timeout terminal action is derived from the persisted interrupt type and is not accepted from request input. The timeout processor RPC is executable only by `service_role`. The existing authenticated decision RPC still requires project-admin authorization. Expired or rejected interrupts cannot resume execution.
