// TESTS
import { describe, expect, it } from 'vitest'
// ORGANISATION SETTINGS
import {
  applyOrganisationSettingsPatch,
  toOrganisationSettingsForm,
  OrganisationSettingsFormSchema,
  readOrganisationSettingsForm,
} from '#lib/organisations/settings.js'
import { toOrganisationFormInput } from '#lib/client/services/organisation.js'
import { OrganisationEntityFormData } from '#lib/db/zod/schema/organisation.js'
// CONTENT LOCALES
import {
  ContentLocaleSettingsFormSchema,
  ContentLocaleSettingsSchema,
} from '#lib/content-locales/settings.js'
// MESSAGING
import {
  DEFAULT_CHAT_APPEARANCE,
  TOASTIE_CHAT_BACKGROUND,
} from '#lib/messaging/appearance.js'

const appearance = { image: TOASTIE_CHAT_BACKGROUND, opacity: 0.08, size: 440 }

describe('organisation settings form', () => {
  it('carries committed appearance into the same baseline used by edit and cancel', () => {
    const source = {
      settings: ContentLocaleSettingsSchema.parse({
        contentLocales: ['en'],
        messagingAppearance: appearance,
        future: true,
      }),
    }
    const baseline = toOrganisationFormInput(source)
    expect(baseline.data.settings).toEqual({
      contentLocales: ['en'],
      messagingAppearance: appearance,
    })
    const draft = readOrganisationSettingsForm(baseline.data.settings)
    if (!draft.messagingAppearance) throw new Error('Missing baseline appearance')
    draft.messagingAppearance.size = 320
    expect(toOrganisationFormInput(source).data.settings).toEqual(
      baseline.data.settings,
    )
    expect(toOrganisationFormInput().data.settings).toEqual({})
  })

  it('merges submitted backgrounds atomically with locale changes and preserves unknown settings', () => {
    const current = ContentLocaleSettingsSchema.parse({
      contentLocales: ['en'],
      multilingualContent: true,
      future: { keep: true },
      messagingAppearance: appearance,
    })
    const patch = OrganisationSettingsFormSchema.parse(
      JSON.stringify({
        contentLocales: ['ja'],
        messagingAppearance: { ...appearance, image: '' },
      }),
    )
    expect(
      OrganisationEntityFormData.shape.settings.parse(JSON.stringify(patch)),
    ).toEqual(patch)
    expect(applyOrganisationSettingsPatch(current, patch)).toEqual({
      ...current,
      contentLocales: ['ja'],
      messagingAppearance: { ...appearance, image: '' },
    })
    expect(
      applyOrganisationSettingsPatch(current, { multilingualContent: null }),
    ).toEqual({
      contentLocales: ['en'],
      future: { keep: true },
      messagingAppearance: appearance,
    })
    expect(applyOrganisationSettingsPatch(current)).toEqual(current)
  })

  it('keeps uploaded image bytes in the organisation form for durable storage', () => {
    const draft = {
      messagingAppearance: {
        ...DEFAULT_CHAT_APPEARANCE,
        image: 'data:image/png;base64,iVBORw0KGgo=',
      },
    }
    expect(readOrganisationSettingsForm(JSON.stringify(draft))).toEqual(draft)
    expect(OrganisationSettingsFormSchema.parse(JSON.stringify(draft))).toEqual(draft)
  })

  it.each([
    { image: 'javascript:alert(1)' },
    { image: 'https://example.com/background.jpg' },
    { image: '/uploads/background.jpg' },
    { opacity: 1 },
    { size: 1 },
  ])(
    'rejects invalid appearance %j and keeps the field organisation-specific',
    patch => {
      const input = { messagingAppearance: { ...appearance, ...patch } }
      expect(OrganisationSettingsFormSchema.safeParse(input).success).toBe(false)
      expect(
        ContentLocaleSettingsFormSchema.safeParse({ messagingAppearance: appearance })
          .success,
      ).toBe(false)
    },
  )
})

it('retains independent Location defaults and supports resetting them', () => {
  const locationPolicy = {
    version: 1 as const,
    coordinates: { mode: 'review' as const },
    address: 'review' as const,
    unit: 'review' as const,
    establishment: 'review' as const,
    relocation: 'review' as const,
    sameSources: false,
  }
  const settings = applyOrganisationSettingsPatch({}, { locationPolicy })
  expect(toOrganisationSettingsForm(settings).locationPolicy).toEqual(locationPolicy)
  expect(
    applyOrganisationSettingsPatch(settings, { locationPolicy: null }),
  ).not.toHaveProperty('locationPolicy')
})
