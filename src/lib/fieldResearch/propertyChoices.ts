/** Select fields belonging to a project from its resolved property catalogue.
 * @param properties Resolved project and inherited properties in display order.
 * @param assignedIds IDs explicitly added to the project.
 * @returns Project-owned fields and enabled, assigned inherited fields.
 */
export function researchProjectProperties<
  T extends { id: string; scope: string; isEnabled?: boolean | null },
>(properties: T[], assignedIds: ReadonlySet<string>): T[] {
  return properties.filter(
    property =>
      property.scope === 'project' ||
      (assignedIds.has(property.id) && property.isEnabled),
  )
}

/** Describe selected defaults without listing multiple values.
 * @param labels Labels of selected values.
 * @returns A short description for the read-only field.
 */
export function researchDefaultSummary(labels: string[]): string {
  if (!labels.length) return 'No default'
  if (labels.length === 1) return labels[0]
  const words = [
    'Zero',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
  ]
  return `${words[labels.length] ?? labels.length} values`
}
