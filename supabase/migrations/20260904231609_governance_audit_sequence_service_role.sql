-- The governance audit table accepts service_role inserts, and its chain_sequence
-- column defaults from this sequence. Keep the sequence grant aligned with the
-- table INSERT grant so server-side audit writes can advance the append-only chain.
grant usage, select on sequence governance.audit_event_chain_sequence to service_role;
