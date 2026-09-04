export async function executeWithReadFallback<T>(input: {
  primary: () => Promise<T>
  fallback: () => Promise<T>
  fallbackEnabled: boolean
  transformFallback?: (value: T, primaryError: unknown) => T
}): Promise<T> {
  try {
    return await input.primary()
  } catch (primaryError) {
    if (!input.fallbackEnabled) throw primaryError
    const fallbackValue = await input.fallback()
    return input.transformFallback ? input.transformFallback(fallbackValue, primaryError) : fallbackValue
  }
}
