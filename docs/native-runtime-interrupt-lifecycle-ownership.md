# Native runtime interrupt lifecycle ownership

The interrupt lifecycle composes with durable supervisor ownership. Waiting runs cannot be claimed by the execution lease, and timeout processing cannot resume a run. This keeps execution ownership and approval authority as separate controls.
