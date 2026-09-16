# Software Supply-Chain and Build Provenance

## Automated gates

- Dependency and lockfile integrity
- Vulnerability/license policy where defined
- Secret scanning
- Static security analysis
- SBOM generation/retention where supported
- Build provenance and artifact identity
- Exact source commit -> build -> deployment linkage
- Migration/version linkage
- Deployment configuration drift checks
- Protected-branch/release policy
- Post-deploy verification against the exact artifact

The artifact certified must be demonstrably the artifact deployed. A green source commit does not certify an unrelated runtime artifact.
