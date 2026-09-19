function snakeToCamel(value: string) {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

export function nativeToolInputAliases(key: string) {
  return Array.from(new Set([key, snakeToCamel(key), camelToSnake(key)]))
}

export function assertNativeToolRawInputSafety(input: {
  propertyKeys: string[]
  additionalProperties: unknown
  rawInput: Record<string, unknown>
  toolKey: string
}) {
  const aliasesByProperty = new Map(
    input.propertyKeys.map(key => [key, nativeToolInputAliases(key)] as const),
  )

  for (const [key, aliases] of aliasesByProperty) {
    const present = aliases.filter(alias => Object.prototype.hasOwnProperty.call(input.rawInput, alias))
    if (present.length > 1) {
      throw new Error(`${input.toolKey} input contract violation: conflicting aliases supplied for ${key}: ${present.join(', ')}`)
    }
  }

  if (input.additionalProperties === false) {
    const declaredAliases = new Set([...aliasesByProperty.values()].flat())
    const undeclared = Object.keys(input.rawInput).filter(key => !declaredAliases.has(key))
    if (undeclared.length) {
      throw new Error(`${input.toolKey} input contract violation: undeclared raw properties are not allowed: ${undeclared.slice(0, 8).join(', ')}`)
    }
  }
}
