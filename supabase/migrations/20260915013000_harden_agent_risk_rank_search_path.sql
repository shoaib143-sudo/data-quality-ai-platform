-- Harden the immutable Agent Policy risk-rank helper against mutable search_path resolution.
-- This addresses the Supabase `function_search_path_mutable` advisor finding without
-- changing function behavior or execution privileges.

alter function governance.agent_risk_rank(text)
  set search_path = '';
