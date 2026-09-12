# Interrupt timeout scheduler

The existing Vercel cron invokes `/api/jobs/worker` every minute. The authorized worker discovers due pending native runtime interrupts and processes each through the service-role-only timeout RPC.
