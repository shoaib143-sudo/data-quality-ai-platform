# Native runtime interrupt lifecycle evidence chain

The evidence chain is interrupt request -> pause checkpoint -> human decision or timeout -> terminal action -> run terminal/escalated state -> optional late-decision audit. Each terminal action is immutable per interrupt.
