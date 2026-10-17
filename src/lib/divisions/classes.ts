/**
 * Formats an upstream division class for compact list labels and display controls.
 * @param value Native SaanSeoi class; display levels do not establish classification.
 * @returns Human-readable class name with a neutral fallback.
 */
export function divisionClassLabel(value: string | null): string {
  const label = value?.replaceAll('_', ' ') ?? 'division'
  return label.charAt(0).toUpperCase() + label.slice(1)
}
