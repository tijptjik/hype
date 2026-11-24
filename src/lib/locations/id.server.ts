// NODE
import { createHash } from 'node:crypto'

/**
 * Derive a stable opaque Location ID for repeatable imports and concurrent source ingestion.
 * @param origin Identity namespace, kept in the hash input rather than exposed in the ID.
 * @param sourceId Stable source identity; never a name, coordinate or mutable source value.
 * @returns Twelve URL-safe characters, matching HYPE's NanoID length and alphabet.
 * @remarks The versioned SHA-256/base64url mapping is fixed across library upgrades.
 * This is a deterministic identifier, not a secret. Existing Location IDs always take
 * precedence; subsequent SaanSeoi identity changes must retain the HYPE identity.
 */
export function deriveLocationId(
  origin:
    | 'breadline-donor'
    | 'breadline-dropoff'
    | 'feature-baseline'
    | 'saanseoi'
    | 'canonical-draft'
    | 'physical-building',
  sourceId: string,
): string {
  if (!sourceId) throw new Error('Location identity requires a nonempty source ID')
  return createHash('sha256')
    .update(JSON.stringify(['hype-place-id-v1', origin, sourceId]))
    .digest('base64url')
    .slice(0, 12)
}

/**
 * Derive an opaque initial revision ID while keeping rerun imports reproducible.
 * @param locationId Stable HYPE Location identity, including retained legacy identities.
 * @returns Twelve URL-safe characters with a separate revision namespace.
 */
export function deriveLocationBaselineId(locationId: string): string {
  if (!locationId) throw new Error('Location baseline requires a nonempty Location ID')
  return createHash('sha256')
    .update(JSON.stringify(['hype-place-baseline-id-v1', locationId]))
    .digest('base64url')
    .slice(0, 12)
}
