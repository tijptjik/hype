// ZOD
import { z } from 'zod'
// PRESENTATION
import { MARKER_STYLE_CODES } from '#lib/features/markerStyle.js'
import { CARD_STYLE_CODES } from '#lib/features/cardStyle.js'
import { MAP_STYLE_KEYS } from '#lib/map/styles/metadata.js'
// FORM HELPERS
import { FormBoolean } from '../form'

/** Layer presentation overrides; empty form values explicitly select User Preference. */
export const LayerMetadataSchema = z
  .object({
    allowFeatureDescriptions: FormBoolean.nullable().optional(),
    locationBasedFeatureNames: FormBoolean.nullable().optional(),
    markerStyleCode: z
      .preprocess(
        value => (value === '' ? null : value),
        z.enum(MARKER_STYLE_CODES).nullable(),
      )
      .optional(),
    cardStyleCode: z
      .preprocess(
        value => (value === '' ? null : value),
        z.enum(CARD_STYLE_CODES).nullable(),
      )
      .optional(),
    mapStyleCode: z
      .preprocess(
        value => (value === '' ? null : value),
        z.enum(MAP_STYLE_KEYS).nullable(),
      )
      .optional(),
  })
  .passthrough()
  .transform(metadata => {
    // Inheritance has one canonical representation so unchanged translation forms
    // do not accidentally submit a restricted metadata change.
    if (metadata.markerStyleCode === null) delete metadata.markerStyleCode
    if (metadata.cardStyleCode === null) delete metadata.cardStyleCode
    return metadata
  })
