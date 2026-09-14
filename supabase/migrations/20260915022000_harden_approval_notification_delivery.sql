-- Runtime v2: make approval notification delivery idempotent and operationally visible.

alter table governance.agent_approval_notification_outbox
  add column if not exists dedupe_key text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

create unique index if not exists ux_agent_approval_notification_outbox_dedupe
  on governance.agent_approval_notification_outbox (dedupe_key)
  where dedupe_key is not null;

alter table governance.agent_approval_notification_outbox
  drop constraint if exists agent_approval_notification_outbox_status_check;

alter table governance.agent_approval_notification_outbox
  add constraint agent_approval_notification_outbox_status_check
  check (status = any (array['PENDING'::text,'SENT'::text,'FAILED'::text,'CANCELLED'::text,'DEAD_LETTER'::text]));

create index if not exists idx_agent_approval_notification_outbox_dead_letter
  on governance.agent_approval_notification_outbox (dead_lettered_at desc, created_at desc)
  where status = 'DEAD_LETTER';
