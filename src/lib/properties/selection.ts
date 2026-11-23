// VALIDATION
import { z } from 'zod'

/** Versioned classifier collections keep option identities separate from translated labels. */
export const SelectionValueSchema = z
  .strictObject({
    version: z.literal(1),
    propertyValueIds: z.array(z.string().min(1).max(128)).min(1).max(100),
  })
  .refine(
    value => new Set(value.propertyValueIds).size === value.propertyValueIds.length,
    'Selected options must be unique',
  )

type Definition = { type?: string; component?: string; cardinality?: string }
type Selection = { propertyValueId?: string | null; valueJson?: string | null }

/** Identify a multi-select classifier from its persisted contract.
 * @param definition Property contract. @returns Whether multiple classifier options are allowed.
 */
export function isMultiSelectProperty(definition: Definition): boolean {
  return (
    definition.type === 'classifier' &&
    definition.component === 'SelectField' &&
    definition.cardinality === 'many'
  )
}

/** Read selected identities, including legacy single selections after a cardinality upgrade.
 * @param selection Stored selection. @returns Option identities; malformed collections throw.
 * @remarks Callers rendering untrusted data should handle invalid storage explicitly.
 */
export function selectedPropertyValueIds(selection: Selection): string[] {
  if (selection.valueJson) {
    if (selection.propertyValueId)
      throw new Error('Classifier storage modes are mutually exclusive')
    return SelectionValueSchema.parse(JSON.parse(selection.valueJson)).propertyValueIds
  }
  return selection.propertyValueId ? [selection.propertyValueId] : []
}

/** Encode an unordered set canonically so reordering does not create false revisions.
 * @param ids Selected option identities. @returns Versioned JSON or null for no selection.
 */
export function encodePropertySelection(ids: string[]): string | null {
  if (!ids.length) return null
  return JSON.stringify(
    SelectionValueSchema.parse({ version: 1, propertyValueIds: [...ids].sort() }),
  )
}

/** Read classifier identities for display/filtering without treating other structured values as choices.
 * @param selection Stored feature property. @returns Valid identities, or an empty list for other/invalid storage.
 */
export function displayPropertyValueIds(selection: Selection): string[] {
  try {
    return selectedPropertyValueIds(selection)
  } catch {
    return []
  }
}
