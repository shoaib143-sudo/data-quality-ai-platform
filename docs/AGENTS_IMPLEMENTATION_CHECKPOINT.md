# AI Agents Implementation Checkpoint

Date: 2026-08-28

## Completed

The AI Agents module now has a live registry and an authenticated execution path.

### Registry

`app/agents/page.tsx` reads enabled agent definitions and enabled tool definitions from the live `agent` schema using the authenticated Supabase server client.

The page also loads authorized projects, datasets, and dataset versions for execution selection.

### Execution

`app/api/agents/run/route.ts` implements the first end to end runnable agent path:

1. Require an authenticated Supabase user.
2. Validate the selected enabled agent through the authenticated client.
3. Require the registered `profiling_agent` key.
4. Validate the selected dataset version belongs to the selected project through authenticated RLS protected reads.
5. Create `agent.agent_runs` through the server side admin client.
6. Create `profiling.profile_runs` linked to the agent run.
7. Resolve the enabled `profile_dataset` tool for the exact selected agent definition.
8. Create `agent.agent_run_steps`.
9. Execute the existing deterministic profiling executor.
10. Persist step and agent run completion state.
11. Persist failure state for the agent run, step, and profiling run when execution fails.

The route is Node.js based and allows up to 300 seconds for the profiling execution.

### UI

`app/agents/run-agent-form.tsx` provides project and dataset version selection and starts the authenticated execution request.

The UI does not silently choose between the two enabled `profiling_agent` versions. The exact agent definition selected by the user is sent to the server.

### Security

`lib/supabase/admin.ts` no longer emits admin client debug information to application logs.

The service role remains server only and is used only after the authenticated request has passed project and dataset authorization checks.

## Known scope boundary

The current end to end runnable operation is `profile_dataset`. Other registered profiling tools remain visible in the registry and are available to the executor contract, but several are intentionally still deterministic placeholders in `lib/profiling/executor.ts`.

The live database contains enabled Profiling Agent versions 1.0 and 2.0. Execution selection is explicit by agent definition ID, so no canonical version is guessed.

## Next work

1. Add run history to the Agents page using project scoped `agent.agent_runs` reads.
2. Expose step status and profiling output.
3. Implement the remaining registered profiling operations where their executor contracts are still placeholders.
4. Add authenticated cross organization execution tests.
5. Complete production smoke verification after the current commits deploy.
