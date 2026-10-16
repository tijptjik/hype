// NODE
import { createHash } from 'node:crypto'
// LIBRARIES
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from 'unique-names-generator'
import type { Config } from 'unique-names-generator'

import { normalizeUsername } from './username'

const usernameConfig: Config = {
  dictionaries: [adjectives, colors, animals],
  separator: '',
  length: 3,
  style: 'capital',
}

/**
 * Generates a random username in the format: adjective + color + animal.
 */
export function generateRandomUsername(): string {
  return normalizeUsername(uniqueNamesGenerator(usernameConfig))
}

/**
 * Generates a deterministic username from a stable user id.
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
 * Generate a stable runner username using the shared random-name dictionaries.
 * @param userId Opaque generated user ID used as the random seed.
 * @param attempt Collision retry number; the same inputs reproduce the same name.
 * @returns A TitleCase adjective, Runner, and exactly two digits.
 */
export function generateRunnerUsernameFromId(userId: string, attempt = 0): string {
  // Keep generated display names within the username length limit.
  const term = (value: string): boolean => /^[a-z]{1,12}$/i.test(value)
  return uniqueNamesGenerator({
    dictionaries: [
      adjectives.filter(term),
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
