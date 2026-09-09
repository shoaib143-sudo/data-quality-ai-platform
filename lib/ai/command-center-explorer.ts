export type CommandCenterExplorerCategory =
  | 'AI_SYSTEM'
  | 'FINDING'
  | 'EVALUATION'
  | 'TELEMETRY'
  | 'INVESTIGATION'
  | 'ROUTING_POLICY'
  | 'AUTONOMY_ACTION'

export type CommandCenterExplorerItem = {
  id: string
  category: CommandCenterExplorerCategory
  title: string
  subtitle: string
  status: string
  source: string
  timestamp: string | null
  details: Array<{ label: string; value: string }>
}

export type CommandCenterExplorerFilters = {
  query?: string
  category?: CommandCenterExplorerCategory | 'ALL'
  status?: string | 'ALL'
  sort?: 'NEWEST' | 'OLDEST' | 'TITLE'
}

function normalized(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function searchableText(item: CommandCenterExplorerItem) {
  return [
    item.title,
    item.subtitle,
    item.status,
    item.source,
    item.category,
    ...item.details.flatMap((detail) => [detail.label, detail.value]),
  ].join(' ').toLowerCase()
}

function timestampValue(value: string | null) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function filterCommandCenterExplorerItems(
  items: CommandCenterExplorerItem[],
  filters: CommandCenterExplorerFilters = {},
) {
  const query = normalized(filters.query)
  const category = filters.category ?? 'ALL'
  const status = filters.status ?? 'ALL'
  const sort = filters.sort ?? 'NEWEST'

  const filtered = items.filter((item) => {
    if (category !== 'ALL' && item.category !== category) return false
    if (status !== 'ALL' && item.status !== status) return false
    if (query && !searchableText(item).includes(query)) return false
    return true
  })

  return [...filtered].sort((left, right) => {
    if (sort === 'TITLE') return left.title.localeCompare(right.title)
    const leftTime = timestampValue(left.timestamp)
    const rightTime = timestampValue(right.timestamp)
    if (leftTime !== rightTime) return sort === 'OLDEST' ? leftTime - rightTime : rightTime - leftTime
    return left.title.localeCompare(right.title)
  })
}

export function commandCenterExplorerCounts(items: CommandCenterExplorerItem[]) {
  const byCategory = new Map<CommandCenterExplorerCategory, number>()
  const byStatus = new Map<string, number>()
  for (const item of items) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1)
    byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1)
  }
  return {
    total: items.length,
    byCategory: Object.fromEntries(byCategory),
    byStatus: Object.fromEntries(byStatus),
  }
}
