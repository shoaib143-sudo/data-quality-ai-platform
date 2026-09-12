# Native runtime interrupt lifecycle safety case

The safety case is simple: timeout cannot approve, rejection cannot resume, expired interrupts cannot resume, and user input cannot choose the timeout terminal action. Human authority remains the only path to approval-required execution.
