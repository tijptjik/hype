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

export const getDuplicateValues = <T>(values: T[]): T[] =>
  values.filter((value, index, array) => array.indexOf(value) !== index)

export const requireValue = <T>(
  value: T | null | undefined,
  onMissing: () => never,
): T => {
  if (value == null) onMissing()
  return value
}

export const toCreatedResponseShape = <T extends { id: string; modifiedAt: string }>(
  value: T,
): { data: { id: string; modifiedAt: string } } => ({
  data: {
    id: value.id,
    modifiedAt: value.modifiedAt,
  },
})

export const hasRoleMembershipChanged = (
  submittedRoles: Array<{ userId: string; role: string }>,
  existingRoles: Array<{ userId: string; role: string }>,
  toSignature: (roles: Array<{ userId: string; role: string }>) => string,
): boolean => toSignature(submittedRoles) !== toSignature(existingRoles)

export const validateUniqueNonReservedCode = async (params: {
  code: string
  current?: { id: string; code: string }
  isReservedCode: (code: string) => boolean
  probeExisting: (code: string) => Promise<{ id: string } | null>
  onReserved: () => void
  onConflict: () => void
}): Promise<void> => {
  const isReserved =
    params.isReservedCode(params.code) &&
    (!params.current || params.code !== params.current.code)
  if (isReserved) {
    params.onReserved()
    return
  }

  const persisted = await params.probeExisting(params.code)
  if (persisted && (!params.current || persisted.id !== params.current.id)) {
    params.onConflict()
  }
}
