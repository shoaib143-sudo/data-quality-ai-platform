# Persona test principal provisioning

Status: in progress until production provisioning and all 13 login checks complete.

This discussion records the operational path for creating 13 dedicated interactive DataNexus test principals without converting machine service identities into human password accounts.

The durable model is authentication identity -> organization membership -> project governance role -> persona. Existing service identities remain untouched. Each test principal is a Supabase Auth user, is an ordinary organization MEMBER, and has exactly one active finalized governance persona role on the target project.

The temporary provisioning endpoint is OWNER-only and requires both a projectId and an explicit execution confirmation token. It uses the existing server-side Supabase admin client, creates or updates the 13 persona test users, rotates their passwords, confirms their synthetic test email identifiers administratively, enforces MEMBER organization tenancy, deactivates previous active persona bindings for those users across the organization, creates exactly one active role binding on the target project, and writes governance audit events without logging passwords.

Temporary test identifiers use the datanexus.test domain and are not intended for email delivery. They exist only to satisfy Supabase email/password identity requirements for controlled persona acceptance testing.

After provisioning succeeds, verify each user by signing in through /login using email/password, confirm the resolved /home/<persona> route, execute the persona's expected workflows, verify negative authorization boundaries, record defects, then sign out before moving to the next principal.

After credentials are captured and verification is complete, remove both the temporary provisioning API and its temporary admin execution page. Do not store plaintext passwords in GitHub, database tables, application logs, governance audit metadata, or source files.
