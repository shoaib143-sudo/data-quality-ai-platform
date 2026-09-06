# Module 15 production rollback integration plan

1. Create a transient AI system version in an existing project.
2. Verify it is not active before human review.
3. Record non-human assessment evidence and verify it grants no authority.
4. Verify a reviewer without `policy.approve` is rejected.
5. Approve the exact current version with a governed human reviewer and verify activation.
6. Register a newer version and verify lifecycle returns to `DRAFT`.
7. Verify the prior version approval cannot authorize the newer current version.
8. Revoke or reject current authority and verify the system is not active.
9. Verify immutable evidence rejects mutation.
10. Roll back the transaction and confirm no transient residue.
