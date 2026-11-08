/** Require an arranged fixture value before a test inspects its properties.
 * @param value Fixture lookup or service result expected to exist.
 * @returns The non-null value, with a useful failure if fixture setup is incomplete.
 */
export function required<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error('Expected fixture value to exist')
  return value
}
