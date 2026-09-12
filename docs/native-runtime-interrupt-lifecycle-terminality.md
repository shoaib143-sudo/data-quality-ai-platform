# Native runtime interrupt lifecycle terminality

Once timeout terminal evidence exists, the interrupt is not resumable. Any later continuation must use a separately governed recovery or replay path rather than mutating the expired interrupt back into a running state.
