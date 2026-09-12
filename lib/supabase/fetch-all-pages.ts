type PageError = {
  message: string
}

type PageResult<T> = {
  data: T[] | null
  error: PageError | null
}

type FetchAllPagesOptions = {
  label: string
  pageSize?: number
}

/**
 * Collect every row from a PostgREST query without relying on the server's
 * configured maximum row count. Callers must provide a deterministic order.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { label, pageSize = 500 }: FetchAllPagesOptions,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('pageSize must be a positive integer')
  }

  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw new Error(`Unable to load ${label}: ${error.message}`)

    const page = data ?? []
    rows.push(...page)

    if (page.length < pageSize) return rows
    from += pageSize
  }
}
