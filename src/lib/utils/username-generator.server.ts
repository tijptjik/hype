// NODE
import { createHash } from 'node:crypto'
// LIBRARIES
import { uniqueNamesGenerator, animals } from 'unique-names-generator'
// USERNAMES
import { normalizeUsername } from './username'
import { USERNAME_ADJECTIVES } from './username-adjectives'
// TYPES
import type { Config } from 'unique-names-generator'

// Both generators use the same reviewed vocabulary, without an upstream fallback.
const adjectives = [...USERNAME_ADJECTIVES]

const usernameConfig: Config = {
  dictionaries: [
    adjectives.filter(term => term.length <= 18),
    animals.filter(term => /^[a-z]{1,12}$/i.test(term)),
    Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0')),
  ],
  separator: '',
  length: 3,
  style: 'capital',
}

/**
 * Generates a random username in the format: positive adjective + animal + two digits.
 * @returns A canonical username beginning with a whitelisted adjective.
 */
export function generateRandomUsername(): string {
  return normalizeUsername(uniqueNamesGenerator(usernameConfig))
}

/**
 * Generates a deterministic username from a stable user id.
 * @param userId Stable identity used as the generation seed.
 * @param attempt Collision retry number.
 * @returns A canonical username beginning with a whitelisted adjective.
 * @remarks Repeatability depends on keeping the dictionary and its order unchanged.
 */
export function generateUsernameFromId(userId: string, attempt = 0): string {
  return normalizeUsername(generateDisplayUsernameFromId(userId, attempt))
}

/**
 * Generate the display spelling of a stable HYPE username.
 * @param userId Stable identity used as the generation seed.
 * @param attempt Collision retry number.
 * @returns An approved adjective, animal, and exactly two digits, at most 32 characters.
 * @remarks Hash the seed to avoid the upstream library's character-sum collisions.
 */
export function generateDisplayUsernameFromId(userId: string, attempt = 0): string {
  return uniqueNamesGenerator({
    ...usernameConfig,
    seed: createHash('sha256').update(`${userId}:${attempt}`).digest().readUInt32BE(0),
  })
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
