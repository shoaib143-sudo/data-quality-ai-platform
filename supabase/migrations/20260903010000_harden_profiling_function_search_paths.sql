alter function profiling.execute_metrics(uuid) set search_path to pg_catalog, profiling;
alter function profiling.run_profile(uuid) set search_path to pg_catalog, profiling;
alter function profiling.calculate_quality_score(uuid) set search_path to pg_catalog, profiling;
alter function profiling.generate_findings(uuid) set search_path to pg_catalog, profiling;
