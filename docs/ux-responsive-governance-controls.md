# Responsive Governance Controls

This increment hardens dense governance controls for narrow viewports without changing governance behavior.

## Covered surfaces

The responsive contract now includes:

- quality-rule creation and editing controls;
- workflow capability summaries;
- scorecard project selection and refresh actions;
- governance report project selection.

Paired and three-column controls stack before the small-screen breakpoint. Selectors use the available viewport width instead of forcing a desktop minimum width.

## Boundary

This is a source-level responsive contract enforced by CI. It does not claim that every DataNexus surface has completed browser-assisted responsive acceptance. Remaining dense workspaces should be reviewed at representative mobile, tablet, desktop, zoom, and text-scaling widths before the broader responsive UX item is considered complete.
