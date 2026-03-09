import { toStableSignature, toTriStateBoolean } from '$lib/api'

export const toBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export const toTriStateBooleanOrUndefined = (
  value: unknown,
): boolean | null | undefined => {
  return toTriStateBoolean(value)
}

export { toStableSignature }

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

export const toBooleanStateResponseShape = <
  K extends 'isPublished' | 'isArchived',
  T extends { id: string } & Record<K, boolean>,
>(
  value: T,
  field: K,
): { data: { id: string } & Record<K, boolean> } =>
  ({
    data: {
      id: value.id,
      [field]: value[field],
    },
  }) as { data: { id: string } & Record<K, boolean> }

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
  // Update flow: unchanged code should always pass uniqueness checks.
  if (params.current && params.code === params.current.code) return

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

/**
 * Infers property discriminator type from the UI field component identifier.
 *
 * @param component - Submitted field component key.
 * @returns Inferred discriminator or `undefined` when component is not recognized.
 */
export const inferPropertyDiscriminatorFromComponent = (
  component: unknown,
): 'classifier' | 'specifier' | undefined => {
  if (
    component === 'SelectField' ||
    component === 'RangeField' ||
    component === 'ToggleField'
  ) {
    return 'classifier'
  }
  if (component === 'InputField' || component === 'TextareaField') {
    return 'specifier'
  }
  return undefined
}
