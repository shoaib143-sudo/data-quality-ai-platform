-- Some functions inherit EXECUTE from PUBLIC unless explicitly revoked.
-- Keep the profiling metadata RPC server-side only.
revoke execute on function public.get_dataset_version_for_profiling(uuid) from public;
