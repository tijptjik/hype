/** Identifies navigation independently of the outdoor camera's tracked position.
 * @param href Absolute browser URL before or during an indoor approach.
 * @returns URL retaining the route, hash and all non-camera search parameters.
 * @remarks Camera animation writes these parameters itself and must not cancel entry.
 */
export function indoorEntryNavigationKey(href: string): string {
  const url = new URL(href)
  for (const parameter of ['lng', 'lat', 'zoom', 'bearing', 'pitch']) {
    url.searchParams.delete(parameter)
  }
  return url.href
}
