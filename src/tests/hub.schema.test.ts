import { describe, expect, it } from 'vitest'
import {
  HubAdminProfileAPI,
  HubCardProfileAPI,
  HubDetailProfileAPI,
} from '$lib/db/zod/schema/hub'

describe('HubAdminProfileAPI', () => {
  it('preserves legalContactAddress in admin profile payloads', () => {
    const parsed = HubAdminProfileAPI.parse({
      id: 'hub_123',
      code: 'hkghostsigns',
      domain: 'hkghostsigns.com',
      legalContactAddress: 'm@hkghostsigns.com',
      subscriptionSessionCookie: 'substack.sid=sid-token',
      createdAt: '2026-04-10T00:00:00.000Z',
      modifiedAt: '2026-04-10T00:00:00.000Z',
      isPublished: true,
      isArchived: false,
      isSubscriptionAvailable: true,
      subscriptionService: 'substack',
      subscriptionId: 'hkghostsigns',
      subscriptionPlacement: {
        hubPanel: true,
        topBar: false,
        menu: true,
      },
      i18n: {
        en: {
          hubId: 'hub_123',
          locale: 'en',
          name: 'HK Ghost Signs',
          nameGen: false,
          nameShort: 'Ghost Signs',
          nameShortGen: false,
          description: null,
          descriptionGen: false,
          subscriptionBenefits: 'Early access and event updates',
          subscriptionBenefitsGen: false,
          privacyPolicy: null,
          privacyPolicyGen: false,
          termsOfService: null,
          termsOfServiceGen: false,
        },
        zhHans: {
          hubId: 'hub_123',
          locale: 'zh-hans',
          name: 'HK Ghost Signs',
          nameGen: false,
          nameShort: 'Ghost Signs',
          nameShortGen: false,
          description: null,
          descriptionGen: false,
          subscriptionBenefits: 'Simplified Chinese benefits',
          subscriptionBenefitsGen: false,
          privacyPolicy: null,
          privacyPolicyGen: false,
          termsOfService: null,
          termsOfServiceGen: false,
        },
        zhHant: {
          hubId: 'hub_123',
          locale: 'zh-hant',
          name: 'HK Ghost Signs',
          nameGen: false,
          nameShort: 'Ghost Signs',
          nameShortGen: false,
          description: null,
          descriptionGen: false,
          subscriptionBenefits: 'Traditional Chinese benefits',
          subscriptionBenefitsGen: false,
          privacyPolicy: null,
          privacyPolicyGen: false,
          termsOfService: null,
          termsOfServiceGen: false,
        },
      },
      image: null,
      userRoles: [],
      organisations: [],
      layerDefaults: [],
      properties: [],
    })

    expect(parsed.legalContactAddress).toBe('m@hkghostsigns.com')
    expect(parsed.subscriptionSessionCookie).toBe('substack.sid=sid-token')
  })
})

describe('hub subscription profiles', () => {
  const baseHub = {
    id: 'hub_123',
    code: 'hkghostsigns',
    domain: 'hkghostsigns.com',
    legalContactAddress: 'm@hkghostsigns.com',
    createdAt: '2026-04-10T00:00:00.000Z',
    modifiedAt: '2026-04-10T00:00:00.000Z',
    isPublished: true,
    isArchived: false,
    isSubscriptionAvailable: true,
    subscriptionService: 'substack',
    subscriptionId: 'hkghostsigns',
    subscriptionPlacement: {
      hubPanel: true,
      topBar: false,
      menu: true,
    },
    i18n: {
      en: {
        hubId: 'hub_123',
        locale: 'en',
        name: 'HK Ghost Signs',
        nameGen: false,
        nameShort: 'Ghost Signs',
        nameShortGen: false,
        description: null,
        descriptionGen: false,
        subscriptionBenefits: 'Early access and event updates',
        subscriptionBenefitsGen: false,
        privacyPolicy: null,
        privacyPolicyGen: false,
        termsOfService: null,
        termsOfServiceGen: false,
      },
      zhHans: {
        hubId: 'hub_123',
        locale: 'zh-hans',
        name: 'HK Ghost Signs',
        nameGen: false,
        nameShort: 'Ghost Signs',
        nameShortGen: false,
        description: null,
        descriptionGen: false,
        subscriptionBenefits: 'Simplified Chinese benefits',
        subscriptionBenefitsGen: false,
        privacyPolicy: null,
        privacyPolicyGen: false,
        termsOfService: null,
        termsOfServiceGen: false,
      },
      zhHant: {
        hubId: 'hub_123',
        locale: 'zh-hant',
        name: 'HK Ghost Signs',
        nameGen: false,
        nameShort: 'Ghost Signs',
        nameShortGen: false,
        description: null,
        descriptionGen: false,
        subscriptionBenefits: 'Traditional Chinese benefits',
        subscriptionBenefitsGen: false,
        privacyPolicy: null,
        privacyPolicyGen: false,
        termsOfService: null,
        termsOfServiceGen: false,
      },
    },
    image: null,
  }

  it('includes subscription fields on the card profile', () => {
    const parsed = HubCardProfileAPI.parse(baseHub)

    expect(parsed.isSubscriptionAvailable).toBe(true)
    expect(parsed.subscriptionService).toBe('substack')
    expect(parsed.subscriptionId).toBe('hkghostsigns')
    expect(parsed.i18n.en.subscriptionBenefits).toBe('Early access and event updates')
    expect(parsed.subscriptionPlacement).toEqual({
      hubPanel: true,
      topBar: false,
      menu: true,
    })
  })

  it('includes subscription fields on the detail profile', () => {
    const parsed = HubDetailProfileAPI.parse({
      ...baseHub,
      userRoles: [],
      organisations: [],
      layerDefaults: [],
      properties: [],
    })

    expect(parsed.isSubscriptionAvailable).toBe(true)
    expect(parsed.i18n.en.subscriptionBenefits).toBe('Early access and event updates')
    expect(parsed.subscriptionPlacement).toEqual({
      hubPanel: true,
      topBar: false,
      menu: true,
    })
  })
})
