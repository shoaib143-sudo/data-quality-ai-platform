-- One decision is sufficient to resolve one approval axis. Enforce this centrally so
-- DataNexus, Email and Teams cannot replay or duplicate an axis decision.

create unique index if not exists ux_agent_approval_decisions_request_axis
  on governance.agent_approval_decisions (approval_request_id, approval_axis);

comment on index governance.ux_agent_approval_decisions_request_axis
  is 'Prevents replay and duplicate decisions for the same approval request axis across all approval channels.';
