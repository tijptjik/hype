export const toBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export const toTriStateBooleanOrUndefined = (
  value: unknown,
): boolean | null | undefined => {
  if (value === null) return null
  return toBooleanOrUndefined(value)
}
