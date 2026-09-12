# Native runtime interrupt lifecycle API boundary

No new user-facing timeout mutation endpoint is introduced. Timeout mutation is internal to the service-role worker path, while the existing authenticated decision RPC remains project-admin authorized.
