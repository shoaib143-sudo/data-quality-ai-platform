export function assertIndependentCertificationProducer(input: {
  executionActorUserId: string | null
  certifierUserId: string
}) {
  const executionActorUserId = input.executionActorUserId?.trim() || null
  const certifierUserId = input.certifierUserId.trim()
  if (!certifierUserId) throw new Error('Certification reviewer identity is required.')
  if (!executionActorUserId) throw new Error('Certification cannot proceed because the implementation producer identity is unavailable.')
  if (executionActorUserId === certifierUserId) {
    throw new Error('Independent certification requires a reviewer different from the implementation producer.')
  }
}
