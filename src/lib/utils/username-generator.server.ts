// NODE
import { createHash } from 'node:crypto'
// LIBRARIES
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator'
// USERNAMES
import { normalizeUsername } from './username'
import { USERNAME_ADJECTIVES } from './username-adjectives'
// TYPES
import type { Config } from 'unique-names-generator'

// Both generators use the same reviewed vocabulary, without an upstream fallback.
const adjectives = [...USERNAME_ADJECTIVES]

const usernameConfig: Config = {
  dictionaries: [adjectives, colors, animals],
  separator: '',
  length: 3,
  style: 'capital',
}

/**
 * Generates a random username in the format: adjective + color + animal.
 * @returns A canonical username beginning with a whitelisted adjective.
 */
export function generateRandomUsername(): string {
  return normalizeUsername(uniqueNamesGenerator(usernameConfig))
}

/**
 * Generates a deterministic username from a stable user id.
 * @param userId Stable identity used as the generation seed.
 * @returns A canonical username beginning with a whitelisted adjective.
 * @remarks Repeatability depends on keeping the dictionary and its order unchanged.
 */
export function generateUsernameFromId(userId: string): string {
  return normalizeUsername(
    uniqueNamesGenerator({
      ...usernameConfig,
      seed: userId,
    }),
  )
}

/**
 * Generate a stable runner username using the shared adjective whitelist.
 * @param userId Opaque generated user ID used as the random seed.
 * @param attempt Collision retry number; the same inputs reproduce the same name.
 * @returns A TitleCase adjective, Runner, and exactly two digits.
 */
export function generateRunnerUsernameFromId(userId: string, attempt = 0): string {
  // The whitelist's length bound keeps generated display names within the limit.
  return uniqueNamesGenerator({
    dictionaries: [
      adjectives,
      ['Runner'],
      Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0')),
    ],
    separator: '',
    length: 3,
    style: 'capital',
    // The library sums string character codes; hash first to avoid clustered seeds.
    seed: createHash('sha256').update(`${userId}:${attempt}`).digest().readUInt32BE(0),
  })
}
