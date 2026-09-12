# Native runtime interrupt lifecycle post-deploy checks

Post-deploy verification should confirm the migration objects exist, the timeout RPC is service-role-only, no due pending interrupts are unexpectedly stranded, and the scheduled worker reports timeout sweep metrics without processor failures.
