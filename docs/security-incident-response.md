# DataNexus Security Incident Response

Security incident response is distinct from deployment rollback, execution recovery, and disaster recovery. This contract governs suspected compromise, unauthorized access, integrity loss, privacy exposure, supply-chain compromise, and AI/tool authority violations.

## Required lifecycle

Every security incident follows:

`DETECT → CLASSIFY → CONTAIN → PRESERVE_EVIDENCE → ERADICATE → RECOVER → COMMUNICATE → POST_INCIDENT_REVIEW → CONTROL_UPDATE`

Containment may occur immediately when delaying it would increase impact, but evidence preservation must begin as soon as safely possible. Recovery must not delete or rewrite incident evidence.

## Severity

- **SEV0** — active or credible compromise of platform-wide authority, secret material, production control plane, or material data exfiltration.
- **SEV1** — confirmed authorization bypass, significant tenant/project boundary violation, material integrity/privacy incident, or autonomous execution outside governed authority.
- **SEV2** — contained security control failure with limited impact or credible exploitability.
- **SEV3** — low-impact security defect or suspicious event requiring tracked remediation.

SEV0/SEV1 require a post-incident review. Every incident requires either a control update or an explicit evidence-backed decision that no control change is warranted.

## Incident classes

The canonical classes are AUTHORIZATION_BYPASS, SECRET_EXPOSURE, DATA_EXFILTRATION, SUPPLY_CHAIN_COMPROMISE, AI_AUTHORITY_BREACH, INTEGRITY_TAMPERING, AVAILABILITY, and PRIVACY.

## Evidence rules

Evidence is append-only in intent. Preserve timestamps, actor/service identity, request/trace IDs, relevant commit/deployment IDs, affected authoritative record IDs, configuration names, and cryptographic hashes where useful. Never copy secret values, access tokens, passwords, private keys, service-role credentials, or raw sensitive source data into incident evidence.

## Containment rules

Use the smallest action that reliably stops further harm: revoke/rotate a credential, disable an exposed capability, pause governed execution, deny a policy path, isolate a service, or roll back application code when state is healthy. Do not use application rollback as a substitute for data recovery or evidence preservation.

## Recovery and verification

Recovery follows `docs/recovery-assurance-v2.md` when reconstruction or data restoration is required. Service restoration is not closure: authorization boundaries, integrity, affected data, credentials, dependency posture, and production readiness must be independently revalidated before the incident can close.

## Communications

Record an incident owner, technical lead, decision authority, and communication owner. External notifications are made only when applicable obligations and verified incident facts require them. Do not speculate about exposure before evidence supports the claim.

## Post-incident review

The review records root cause, exploited or failed controls, detection quality, containment effectiveness, recovery evidence, recurrence prevention, and the exact corrective PR/migration/configuration evidence. AI-generated analysis may assist investigation but cannot be final incident authority without governed evidence.

The machine-readable companion contract is `infra/platform-assurance/security-incident-response.json`.
