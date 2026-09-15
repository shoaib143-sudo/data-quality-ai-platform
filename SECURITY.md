# Security policy

## Supported version

Security fixes are applied to the current `main` branch. Older commits and preview deployments are not supported release lines.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue, pull request, discussion, or commit message.

Use GitHub's private vulnerability reporting feature for this repository when it is available. If private reporting is unavailable, contact the repository owner privately through the contact method listed on the owner's GitHub profile.

Include only the information needed to reproduce and assess the issue:

* affected component and revision;
* impact and prerequisites;
* minimal reproduction steps;
* relevant logs with credentials, tokens, personal data, and tenant data removed;
* any safe mitigation already identified.

Never include production secrets or customer data in a report. The maintainer will acknowledge the report, assess severity, coordinate remediation, and publish an advisory when disclosure is safe.

## Security expectations

Changes must preserve tenant and project authorization, row-level security, immutable evidence, least-privilege workflow permissions, pinned GitHub Actions, migration integrity, and the permanent P0 to P5 and V0 to V6 certification gates.
