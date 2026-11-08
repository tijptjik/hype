// TYPES
export const LOCATION_TASK_PREVIEW_KINDS = [
  'facts',
  'position',
  'identity',
  'merge',
] as const
export type LocationTaskPreviewKind = (typeof LOCATION_TASK_PREVIEW_KINDS)[number]
export type LocationTaskPreviewSelection = LocationTaskPreviewKind | 'all'

/** Read an explicitly requested development preview without accepting arbitrary task types.
 * @param value URL query value. @returns A known preview selection, or null.
 * @remarks Callers must also require development mode; these examples never create saved tasks.
 */
export function locationTaskPreviewSelection(
  value: string | null,
): LocationTaskPreviewSelection | null {
  return value === 'all' || LOCATION_TASK_PREVIEW_KINDS.some(kind => kind === value)
    ? (value as LocationTaskPreviewSelection)
    : null
}

/** Fictional comparisons shared by the editor and queue previews. */
export const LOCATION_TASK_PREVIEWS: Record<
  LocationTaskPreviewKind,
  { before: string; after: string }
> = {
  facts: {
    before: 'Harbour Bakery · +852 2345 6789',
    after: 'Harbour Bakery & Café · +852 2345 6790',
  },
  position: {
    before: '18 Sample Street · 114.155120, 22.280440',
    after: '20 Sample Street · 114.155260, 22.280510',
  },
  identity: {
    before: 'Harbour Bakery · Unmatched Location',
    after: 'Harbour Bakery · Suggested source establishment',
  },
  merge: {
    before: 'Harbour Bakery · Two Location records',
    after: 'One Location · Three linked Features retained',
  },
}
