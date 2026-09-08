alter table governance.ai_telemetry_events
  add column if not exists trace_id text null,
  add column if not exists span_id text null,
  add column if not exists parent_span_id text null,
  add column if not exists trace_flags text null,
  add column if not exists tracestate text null;

alter table governance.ai_telemetry_events
  drop constraint if exists ai_telemetry_events_trace_id_check,
  add constraint ai_telemetry_events_trace_id_check
    check (trace_id is null or (trace_id ~ '^[0-9a-f]{32}$' and trace_id <> repeat('0', 32))),
  drop constraint if exists ai_telemetry_events_span_id_check,
  add constraint ai_telemetry_events_span_id_check
    check (span_id is null or (span_id ~ '^[0-9a-f]{16}$' and span_id <> repeat('0', 16))),
  drop constraint if exists ai_telemetry_events_parent_span_id_check,
  add constraint ai_telemetry_events_parent_span_id_check
    check (parent_span_id is null or (parent_span_id ~ '^[0-9a-f]{16}$' and parent_span_id <> repeat('0', 16))),
  drop constraint if exists ai_telemetry_events_trace_flags_check,
  add constraint ai_telemetry_events_trace_flags_check
    check (trace_flags is null or trace_flags ~ '^[0-9a-f]{2}$'),
  drop constraint if exists ai_telemetry_events_trace_context_coherence_check,
  add constraint ai_telemetry_events_trace_context_coherence_check
    check (
      (span_id is null or trace_id is not null)
      and (parent_span_id is null or trace_id is not null)
      and (trace_flags is null or trace_id is not null)
      and (tracestate is null or (length(tracestate) between 1 and 512 and tracestate !~ E'[\r\n]'))
    );

create index if not exists ai_telemetry_events_project_trace_idx
  on governance.ai_telemetry_events (project_id, trace_id, observed_at desc)
  where trace_id is not null;

comment on column governance.ai_telemetry_events.trace_id is
  'W3C/OpenTelemetry trace identifier. Lowercase 32-hex, non-zero. Observability evidence only; never governance authority.';
comment on column governance.ai_telemetry_events.span_id is
  'W3C/OpenTelemetry span identifier. Lowercase 16-hex, non-zero.';
comment on column governance.ai_telemetry_events.parent_span_id is
  'Optional parent span identifier when supplied by upstream instrumentation.';
comment on column governance.ai_telemetry_events.trace_flags is
  'W3C trace-flags byte encoded as two lowercase hex characters.';
comment on column governance.ai_telemetry_events.tracestate is
  'Optional W3C tracestate header value, bounded and newline-free. No prompts, completions, or hidden reasoning payloads.';
