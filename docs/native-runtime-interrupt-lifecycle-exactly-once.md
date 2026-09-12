# Exactly-once terminal action semantics

Each interrupt has at most one row in `agent_run_interrupt_terminal_actions`. Row locking plus the primary key makes repeated timeout sweeps observe the existing outcome rather than create a second escalation or cancellation.
