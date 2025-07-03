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

/**
 * Converts a display username to a URL-safe username
 * Removes spaces, special characters, and converts to lowercase
 */
export function makeUrlSafeUsername(displayUsername: string): string {
  return displayUsername
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric characters
    .slice(0, 32); // Limit to 32 characters
}

/**
 * Validates that a display username contains no spaces and is not empty
 */
export function validateDisplayUsername(displayUsername: string): boolean {
  return (
    displayUsername.trim().length > 0 &&
    !displayUsername.includes(' ') &&
    displayUsername.trim() === displayUsername
  );
}
