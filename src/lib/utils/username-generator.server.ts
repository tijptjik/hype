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
