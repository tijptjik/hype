// NODE
import { createHash } from 'node:crypto'

/**
 * Derive a stable opaque Place ID for repeatable imports and concurrent source ingestion.
 * @param origin Identity namespace, kept in the hash input rather than exposed in the ID.
 * @param sourceId Stable source identity; never a name, coordinate or mutable source value.
 * @returns Twelve URL-safe characters, matching HYPE's NanoID length and alphabet.
 * @remarks The versioned SHA-256/base64url mapping is fixed across library upgrades.
 * This is a deterministic identifier, not a secret. Existing Place IDs always take
 * precedence; subsequent SaanSeoi identity changes must retain the HYPE identity.
 */
export function derivePlaceId(
  origin: 'breadline-donor' | 'breadline-dropoff' | 'feature-baseline' | 'saanseoi',
  sourceId: string,
): string {
  if (!sourceId) throw new Error('Place identity requires a nonempty source ID')
  return createHash('sha256')
    .update(JSON.stringify(['hype-place-id-v1', origin, sourceId]))
    .digest('base64url')
    .slice(0, 12)
}
