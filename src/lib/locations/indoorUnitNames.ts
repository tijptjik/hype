/** Keep a polygon's physical identity separate from names supplied for its occupants.
 * @param names Original unit names.
 * @param properties Original unit properties.
 * @param occupants Explicitly linked source occupant names, never inferred matches.
 * @returns Unit number or neutral unit label when the source uses a tenant as its name.
 * @remarks Does not create or accept establishment identities or occupancy relationships.
 */
export function indoorUnitNames(
  names: Record<string, string>,
  properties: Record<string, unknown>,
  occupants: Array<{ names: Record<string, string> }>,
): Record<string, string> {
  // Unnamed source polygons still have a physical category and often an explicit floor label.
  if (!Object.values(names).some(name => name.trim())) {
    const number =
      typeof properties.unit_unitnumbername === 'string'
        ? properties.unit_unitnumbername.trim()
        : ''
    const category =
      typeof properties.unit_category === 'string'
        ? properties.unit_category.replace(/[._-]/g, ' ')
        : 'unit'
    const label = category.replace(/\b\w/g, letter => letter.toUpperCase()) || 'Unit'
    const floor =
      typeof properties.level_name_en === 'string'
        ? properties.level_name_en.trim()
        : ''
    return { en: number || [label, floor].filter(Boolean).join(' · ') }
  }
  const normalize = (value: string): string => value.trim().toLocaleLowerCase()
  const tenantNames = new Set(
    occupants.flatMap(row => Object.values(row.names).map(normalize)).filter(Boolean),
  )
  if (!Object.values(names).some(name => tenantNames.has(normalize(name)))) return names
  const number =
    typeof properties.unit_unitnumbername === 'string'
      ? properties.unit_unitnumbername.trim()
      : ''
  const code = /^[A-Z]{2,6}\s*\d+[A-Z]?(?:\s*[-/&]\s*\d+[A-Z]?)*$/i.test(
    names.en?.trim() ?? '',
  )
    ? names.en.trim()
    : ''
  return { en: number || code || 'Unit' }
}
