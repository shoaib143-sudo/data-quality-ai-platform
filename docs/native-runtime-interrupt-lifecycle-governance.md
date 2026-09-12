# Native runtime interrupt lifecycle governance

The lifecycle preserves the existing project-admin decision boundary. The worker only processes already-expired deadlines through a service-role-only RPC and cannot create an approval decision.
