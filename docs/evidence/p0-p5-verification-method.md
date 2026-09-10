# P5 verification method

The live worker-pool verification creates synthetic jobs in a transaction, claims 30 jobs per workload pool through `orchestration.claim_jobs_by_pool`, records database-side elapsed time, validates invalid-pool rejection, fills project concurrency capacity, verifies an additional claim is blocked, and rolls back all fixtures.
