create unique index if not exists dataset_execution_sources_one_active_per_version
on profiling.dataset_execution_sources(dataset_version_id)
where active = true;
