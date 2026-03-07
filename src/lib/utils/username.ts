import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from 'unique-names-generator'
import type { Config } from 'unique-names-generator'

const usernameConfig: Config = {
  dictionaries: [adjectives, colors, animals],
  separator: '',
  length: 3,
  style: 'capital',
}

/**
 * Generates a random username in the format: adjective + color + animal
 * e.g., "quickbluewhale", "cleverpurplecat"
 */
export function generateRandomUsername(): string {
  return normalizeUsername(uniqueNamesGenerator(usernameConfig))
}

/**
 * Generates a consistent username based on user ID (same as backfill script)
 */
export function generateUsernameFromId(userId: string): string {
  const seedConfig: Config = {
    ...usernameConfig,
    seed: userId,
  }

  return normalizeUsername(uniqueNamesGenerator(seedConfig))
}

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
