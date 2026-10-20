export async function authorizeProject(actorUserId, projectId, capability) {
  if (!actorUserId || !projectId || capability !== 'admin.manage') throw new Error('test authorization contract failed')
}
