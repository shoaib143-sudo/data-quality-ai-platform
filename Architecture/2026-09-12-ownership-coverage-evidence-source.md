# Ownership Coverage Evidence Source

## Decision

Role landing ownership coverage is derived from `governance.stewardship_dataset_coverage`, which is itself derived from active `governance.stewardship_assignments` for dataset targets.

`governance.dataset_catalog` remains authoritative for dataset catalog attributes such as certification status and criticality, but it is not the source for landing-page ownership coverage.

## Reason

The live environment contains stewardship assignments represented through the stewardship coverage surface while `governance.dataset_catalog` may legitimately have no rows. Computing ownership from catalog owner columns therefore under-reported governed accountability as 0% even when active stewardship assignments existed.

## Presentation boundary

The UI does not infer or synthesize ownership. It consumes the governed stewardship coverage status. A dataset is treated as having accountability evidence when its stewardship coverage status is not `UNASSIGNED`.
