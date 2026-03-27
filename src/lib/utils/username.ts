/**
 * Normalize a username to the app-safe canonical form.
 */
export function normalizeUsername(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32)
}

/**
 * Validates that a username already matches the canonical app-safe format.
 */
export function validateUsername(username: string): boolean {
  return /^[a-z0-9_]{1,32}$/.test(username)
}
