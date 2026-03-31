// DRIZZLE
import { eq } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'

/**
 * Appends a boolean equality condition when tri-state input is explicitly true/false.
 * `null` and `undefined` intentionally produce no condition.
 */
export const applyTriStateBooleanCondition = (
  conditions: SQL<unknown>[],
  column: AnyColumn,
  value: boolean | null | undefined,
): void => {
  if (value === true) conditions.push(eq(column, true))
  if (value === false) conditions.push(eq(column, false))
}
