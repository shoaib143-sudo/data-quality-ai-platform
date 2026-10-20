export function cardTransitionName(kind: string, id: string) {
  const safeKind = kind.replace(/[^a-zA-Z0-9_-]/g, '-')
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `dn-${safeKind}-${safeId}`
}
