# Native runtime interrupt audit evidence

The implementation stores terminal timeout or rejection outcomes in `agent.agent_run_interrupt_terminal_actions` and stores late human decisions in `agent.agent_run_interrupt_late_decisions`. Both tables are append-only and project-scoped for authenticated reads. Mutation is restricted to trusted database functions and the service role.
