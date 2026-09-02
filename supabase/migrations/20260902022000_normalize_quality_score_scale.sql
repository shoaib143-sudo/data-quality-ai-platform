-- Quality scores are persisted on a 0..1 scale.
-- Normalize legacy rows that were stored as percentages (0..100).
update profiling.data_quality_scores
set completeness_score = case when completeness_score > 1 then completeness_score / 100 else completeness_score end,
    uniqueness_score = case when uniqueness_score > 1 then uniqueness_score / 100 else uniqueness_score end,
    validity_score = case when validity_score > 1 then validity_score / 100 else validity_score end,
    accuracy_score = case when accuracy_score > 1 then accuracy_score / 100 else accuracy_score end,
    overall_score = case when overall_score > 1 then overall_score / 100 else overall_score end
where completeness_score > 1
   or uniqueness_score > 1
   or validity_score > 1
   or accuracy_score > 1
   or overall_score > 1;
