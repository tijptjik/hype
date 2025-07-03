import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals
} from 'unique-names-generator';
import type { Config } from 'unique-names-generator';

const usernameConfig: Config = {
  dictionaries: [adjectives, colors, animals],
  separator: '',
  length: 3,
  style: 'capital'
};

/**
 * Generates a random username in the format: adjective + color + animal
 * e.g., "quickbluewhale", "cleverpurplecat"
 */
export function generateRandomUsername(): string {
  return uniqueNamesGenerator(usernameConfig);
}

/**
 * Generates a consistent username based on user ID (same as backfill script)
 */
export function generateUsernameFromId(userId: string): string {
  const seedConfig: Config = {
    ...usernameConfig,
    seed: userId
  };

  return uniqueNamesGenerator(seedConfig);
}
