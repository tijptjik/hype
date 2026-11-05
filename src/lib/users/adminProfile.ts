// VALIDATION
import { z } from 'zod'
import { normalizeTelephone } from '#lib/utils/telephone.js'

/** Explicit editable profile fields; credentials and role grants are separate resources. */
export const AdminUserSettingsSchema = z.object({
  name: z.string().trim().max(200).nullable(),
  username: z.string().trim().nullable(),
  attribution: z.string().trim().max(200).nullable(),
  image: z.string().max(2048).nullable(),
  email: z.union([z.email(), z.literal('')]).nullable(),
  telephone: z
    .string()
    .nullable()
    .refine(
      value => !value || Boolean(normalizeTelephone(value)),
      'Invalid phone number',
    ),
  locale: z.enum(['en', 'zh-hant', 'zh-hans']),
  isArchived: z.boolean(),
  emailVerified: z
    .boolean()
    .nullable()
    .transform(value => value === true),
  preferences: z
    .string()
    .max(20000)
    .refine(value => {
      try {
        const parsed = JSON.parse(value)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      } catch {
        return false
      }
    }, 'Invalid preferences'),
  experimental: z
    .string()
    .max(20000)
    .refine(value => {
      try {
        const parsed = JSON.parse(value)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      } catch {
        return false
      }
    }, 'Invalid experimental settings'),
})
export type AdminUserSettings = z.infer<typeof AdminUserSettingsSchema>
