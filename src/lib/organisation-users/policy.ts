// VALIDATION
import { z } from 'zod'

/** Public policy shape; a non-null email rule always uses the organisation's current hub domain. */
export const OrganisationUserPolicySchema = z.object({
  enabled: z.boolean(),
  hubSignIn: z.boolean(),
  emailDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/)
    .nullable(),
  contribution: z.boolean().default(false),
  customCard: z.boolean(),
  revision: z.number().int().nonnegative(),
})
export type OrganisationUserPolicy = z.infer<typeof OrganisationUserPolicySchema>
export const DEFAULT_ORGANISATION_USER_POLICY: OrganisationUserPolicy = {
  enabled: false,
  hubSignIn: false,
  emailDomain: null,
  contribution: false,
  customCard: false,
  revision: 0,
}

/** Decode the policy hidden field in the ordinary organisation form. */
export const OrganisationUserPolicyFormSchema = z.preprocess((value: unknown) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, OrganisationUserPolicySchema.optional())
