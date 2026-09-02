-- Enforce a single enabled agent version per logical agent key and a single
-- enabled implementation per tool key within an agent definition.
-- This prevents ambiguous execution selection while preserving historical
-- disabled versions.

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_definitions_enabled_key
ON agent.agent_definitions (agent_key)
WHERE enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_definitions_enabled_key
ON agent.tool_definitions (agent_definition_id, tool_key)
WHERE enabled = true;
