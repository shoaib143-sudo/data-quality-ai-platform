# Native runtime interrupt lifecycle fail-closed behavior

If the timeout worker cannot process an interrupt, it records the failure in the sweep result and does not mutate the interrupt or restart execution. A waiting approval remains waiting until a valid human decision wins before expiry or the timeout processor records the terminal timeout outcome.
