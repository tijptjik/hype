import { ProjectLocationPolicySchema } from '#lib/locations/model.js'
// VALIDATION
import { z } from 'zod'
// CONTENT LOCALES
import {
  applyContentLocaleSettingsPatch,
  ContentLocaleSettingsPatchSchema,
  toContentLocaleSettingsForm,
  type ContentLocaleSettings,
} from '#lib/content-locales/settings.js'
// MESSAGING
import { ChatAppearanceSchema } from '#lib/messaging/appearance.js'

/** Organisation-only settings use the normal form's authorization and revision guard. */
export const OrganisationSettingsPatchSchema = ContentLocaleSettingsPatchSchema.extend({
  translationPromptOnce: z.boolean().optional(),
  messagingAppearance: ChatAppearanceSchema.optional(),
  locationPolicy: ProjectLocationPolicySchema.nullable().optional(),
})
export type OrganisationSettingsPatch = z.output<typeof OrganisationSettingsPatchSchema>

/** Decode the existing hidden JSON field while leaving malformed input for validation.
 * @param value An object or JSON form value.
 * @returns Decoded input without repairing invalid values.
 */
function decodeSettings(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/** Accept the existing hidden JSON field without accepting unknown settings writes. */
export const OrganisationSettingsFormSchema = z.preprocess(
  decodeSettings,
  OrganisationSettingsPatchSchema.optional(),
)
// Uploaded raster data and bundled selections use the same validation in drafts and saves.

/** Read staged settings without materializing defaults or repairing invalid form input.
 * @param value Current form object or hidden JSON value.
 * @returns Validated editable settings, or an empty rendering fallback.
 */
export function readOrganisationSettingsForm(
  value: unknown,
): OrganisationSettingsPatch {
  const parsed = OrganisationSettingsPatchSchema.safeParse(decodeSettings(value))
  return parsed.success ? (parsed.data ?? {}) : {}
}

/** Build the committed baseline shared by dirty tracking, cancel and submission.
 * @param settings Persisted organisation settings.
 * @returns Only supported editable keys; absent backgrounds remain absent.
 */
export function toOrganisationSettingsForm(
  settings?: ContentLocaleSettings,
): OrganisationSettingsPatch {
  const patch: OrganisationSettingsPatch = toContentLocaleSettingsForm(settings)
  if (typeof settings?.translationPromptOnce === 'boolean')
    patch.translationPromptOnce = settings.translationPromptOnce
  const appearance = ChatAppearanceSchema.safeParse(settings?.messagingAppearance)
  if (appearance.success) patch.messagingAppearance = appearance.data
  const policy = ProjectLocationPolicySchema.safeParse(settings?.locationPolicy)
  if (policy.success) patch.locationPolicy = policy.data
  return patch
}

/** Merge validated organisation form settings while preserving unrelated stored keys.
 * @param current Current persisted settings, or absent for creation.
 * @param patch Explicit changes submitted with the organisation form.
 * @returns Settings for the same atomic organisation revision as the other form fields.
 */
export function applyOrganisationSettingsPatch(
  current: ContentLocaleSettings | null | undefined,
  patch?: OrganisationSettingsPatch,
): ContentLocaleSettings {
  const { messagingAppearance, locationPolicy, translationPromptOnce, ...locales } =
    OrganisationSettingsPatchSchema.parse(patch ?? {})
  const next = applyContentLocaleSettingsPatch(current, locales)
  if (messagingAppearance !== undefined) next.messagingAppearance = messagingAppearance
  if (locationPolicy === null) delete next.locationPolicy
  else if (locationPolicy !== undefined)
    next.locationPolicy = JSON.parse(JSON.stringify(locationPolicy))
  if (translationPromptOnce !== undefined) {
    next.translationPromptOnce = translationPromptOnce
    if (translationPromptOnce && current?.translationPromptOnce !== true)
      next.translationPromptOnceSince = new Date().toISOString()
    if (!translationPromptOnce) delete next.translationPromptOnceSince
  }
  return next
}
