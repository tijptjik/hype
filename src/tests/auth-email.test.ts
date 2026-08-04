import { describe, expect, it } from 'vitest'
import { buildAuthEmail } from '$lib/auth/email'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'

const customHub = {
  code: 'city-signs',
  isCore: false,
  isSuperAdmin: false,
  isAdminRequest: false,
  i18n: {
    en: { name: 'City Signs', nameShort: 'City Signs' },
    zhHans: {},
    zhHant: {},
  },
} satisfies HubOptsExtended

describe('buildAuthEmail', () => {
  it('brands verification emails with the issuing hub and its policy links', () => {
    const email = buildAuthEmail({
      kind: 'verification',
      actionUrl: 'https://citysigns.example/api/auth/verify-email?token=a&next=%2F',
      baseURL: 'https://citysigns.example',
      hub: customHub,
      recipientName: 'Avery',
    })

    expect(email.subject).toBe('Verify your City Signs email address')
    expect(email.text).toContain('Visit City Signs: https://citysigns.example/')
    expect(email.text).toContain(
      'Privacy policy: https://citysigns.example/policy/privacy',
    )
    expect(email.html).toContain('Hi Avery,')
    expect(email.html).toContain('Verify email address')
    expect(email.html).toContain(
      'href="https://citysigns.example/api/auth/verify-email?token=a&amp;next=%2F"',
    )
  })

  it('adds an absolute hub image and does not interpolate unsafe account names', () => {
    const email = buildAuthEmail({
      kind: 'password-reset',
      actionUrl: 'https://citysigns.example/reset-password?token=abc',
      baseURL: 'https://citysigns.example',
      hub: {
        ...customHub,
        image: {
          ctxType: 'hub',
          ctxId: 'hub-1',
          image: {
            id: 'image-1',
            cdn: 'cloudflareR2',
            env: 'production',
            cdnId: null,
            publicId: 'hubs/city-signs/logo',
            contentHash: null,
            version: 2,
            presentationMode: 'cover',
            contributorId: 'user-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            modifiedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
      recipientName: '<Avery>',
    })

    expect(email.subject).toBe('Reset your City Signs password')
    expect(email.html).toContain(
      'https://citysigns.example/image/upload/c_fill,h_160,w_160',
    )
    expect(email.html).toContain('Hi &lt;Avery&gt;,')
    expect(email.html).not.toContain('Hi <Avery>,')
  })
})
