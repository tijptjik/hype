// VALIDATION
import type { z } from 'zod'
import { FeatureLocationOverridesSchema } from './validation'
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'

/** Feature-contributed corrections propose contact, accessibility and identity changes; staff authority determines their destination. */
export const LocationCorrectionPatchSchema = FeatureLocationOverridesSchema.pick({
  names: true,
  phoneNumber: true,
  brands: true,
  location: true,
  websites: true,
  socials: true,
  accessibility: true,
}).superRefine((patch, ctx) => {
  if (!Object.keys(patch).length)
    ctx.addIssue({ code: 'custom', message: 'Choose a correction to submit' })
  if (
    patch.phoneNumber?.mode === 'override' &&
    patch.phoneNumber.value.some(value => !normalizeHongKongPhoneNumber(value))
  )
    ctx.addIssue({
      code: 'custom',
      message: 'Enter valid Hong Kong phone numbers',
      path: ['phoneNumber'],
    })
  if (JSON.stringify(patch).length > 16000)
    ctx.addIssue({ code: 'custom', message: 'Correction is too large' })
})
export type LocationCorrectionPatch = z.infer<typeof LocationCorrectionPatchSchema>
