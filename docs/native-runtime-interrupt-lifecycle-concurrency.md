# Native runtime interrupt lifecycle concurrency

Human decisions and timeout processing lock the same interrupt row. The timeout processor additionally takes the agent-run advisory lock before run-state mutation. This serializes approve/reject versus timeout races so only one terminal outcome can take effect.
