-- Channel-neutral approval notification outbox for DataNexus, Email and Teams.

create table if not exists governance.agent_approval_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references governance.agent_approval_requests(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('DATANEXUS','EMAIL','TEAMS')),
  event_type text not null check (event_type in ('REQUESTED','REMINDER','ESCALATED','DECIDED')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED','CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_approval_notification_outbox_pending
  on governance.agent_approval_notification_outbox(status, next_attempt_at, created_at)
  where status in ('PENDING','FAILED');
create index if not exists idx_agent_approval_notification_outbox_request
  on governance.agent_approval_notification_outbox(approval_request_id, recipient_user_id, channel);

alter table governance.agent_approval_notification_outbox enable row level security;
revoke all on governance.agent_approval_notification_outbox from anon, authenticated;
grant all on governance.agent_approval_notification_outbox to service_role;

comment on table governance.agent_approval_notification_outbox is
  'Single approval notification queue for DataNexus, Email and Teams. Channels never own authorization or decision state.';
