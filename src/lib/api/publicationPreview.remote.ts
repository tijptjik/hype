// API
import { guardedQuery } from './server/guarded.js'
import { resolvePublicationPreview } from './services/publicationPreview.js'
// SCHEMA
import { PublicationPreviewSchema } from '#lib/publication/schema.js'

/**
 * Validates preview access before the public map starts loading private content.
 * @param input Saved resource and descendant publication choice.
 * @returns The authorized persisted target ancestry.
 * @remarks Every subsequent data request independently repeats authorization.
 */
export const getPublicationPreview = guardedQuery(
  PublicationPreviewSchema,
  (input, ctx) => resolvePublicationPreview(ctx, input),
)
