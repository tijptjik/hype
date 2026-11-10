/** Derive an ASCII camelCase API identifier from the English display label.
 * @param label English UI name.
 * @returns A legal identifier, or empty when the label contains no usable characters.
 */
export function propertyKeyFromLabel(label: string): string {
  const words =
    label
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .match(/[A-Za-z0-9]+/g) ?? []
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : lower[0].toUpperCase() + lower.slice(1)
    })
    .join('')
    .replace(/^[0-9]+/, '')
    .replace(/^[A-Z]/, letter => letter.toLowerCase())
}
