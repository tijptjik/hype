import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createSelectSchema } from 'drizzle-zod'
import {
  property,
  propertyValue,
  propertyI18n,
  propertyValueI18n,
  featureI18n,
  organisationI18n,
  organisationRole,
  user,
  image,
} from '#lib/db/schema/index.js'
import { ContentTagInput } from '#lib/i18n/contentRecords.js'
import { valueContract } from '#lib/db/zod/schema/property.form.js'
import {
  PropertyRecord,
  PropertyValueRecord,
  PropertyI18nRecord,
  PropertyValueI18nRecord,
} from '#lib/db/zod/schema/property.profile.js'
import { FeatureI18nBase } from '#lib/db/zod/schema/featureI18n.js'
import { HubRoleFormData } from '#lib/db/zod/schema/hub.form.js'
import { HubRoleBase } from '#lib/db/zod/schema/hub.js'
import { HubRoleType } from '#lib/enums.js'

import { UserBasic } from '#lib/db/zod/schema/userBasic.js'
import { ImageListFields } from '#lib/db/zod/schema/imageList.js'
import {
  OrganisationI18nReadSchema,
  OrganisationRoleReadSchema,
} from '#lib/db/zod/schema/organisation.profile.js'

const oldProperty = createSelectSchema(property)
const contracts = [
  [
    'organisation translation',
    OrganisationI18nReadSchema,
    createSelectSchema(organisationI18n),
  ],
  [
    'organisation role',
    OrganisationRoleReadSchema,
    createSelectSchema(organisationRole, {
      viewAnalytics: z.boolean().optional(),
    }).omit({ grant: true }),
  ],
  [
    'user identity',
    UserBasic,
    createSelectSchema(user).pick({
      id: true,
      username: true,
      displayUsername: true,
      name: true,
      image: true,
      attribution: true,
    }),
  ],
  [
    'image list',
    ImageListFields.omit({
      imageRevisionId: true,
      galleryPosition: true,
      gallerySortMode: true,
      galleryIntentOrder: true,
      galleryCaption: true,
      galleryAlt: true,
    }),
    createSelectSchema(image).pick({
      id: true,
      cdn: true,
      env: true,
      cdnId: true,
      publicId: true,
      contentHash: true,
      version: true,
      presentationMode: true,
      contributorId: true,
      createdAt: true,
      modifiedAt: true,
    }),
  ],
  [
    'property',
    PropertyRecord,
    oldProperty.extend({
      ...valueContract,
      component: z.preprocess(
        value => (value === 'TextField' ? 'InputField' : value),
        oldProperty.shape.component,
      ),
    }),
  ],
  ['property value', PropertyValueRecord, createSelectSchema(propertyValue)],
  [
    'property translation',
    PropertyI18nRecord,
    createSelectSchema(propertyI18n).extend({ locale: ContentTagInput }),
  ],
  [
    'property value translation',
    PropertyValueI18nRecord,
    createSelectSchema(propertyValueI18n).extend({ locale: ContentTagInput }),
  ],
  [
    'feature translation',
    FeatureI18nBase,
    createSelectSchema(featureI18n).extend({
      locale: ContentTagInput,
      addressProperties: z.custom().nullish(),
    }),
  ],
] as const
const candidates: unknown[] = [
  undefined,
  null,
  '',
  'field',
  'TextField',
  'InputField',
  'classifier',
  'specifier',
  'project',
  'organisation',
  'hub',
  'text',
  'link',
  'dateRange',
  'timeRange',
  'date',
  'boolean',
  'number',
  'one',
  'many',
  'internal',
  'public',
  'day',
  'month',
  'year',
  'decade',
  'labelledLinks',
  'numberedReferences',
  'en',
  'zh-hant',
  'invalid locale',
  false,
  true,
  -1,
  0,
  1,
  1.5,
  24,
  36,
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 1,
  Infinity,
  NaN,
  [],
  {},
  { name: 'value' },
]

describe('browser read contract parity with database schema', () => {
  for (const [name, actual, expected] of contracts) {
    it(`preserves every ${name} field contract`, () => {
      expect(Object.keys(actual.shape).sort()).toEqual(
        Object.keys(expected.shape).sort(),
      )
      for (const key of Object.keys(expected.shape)) {
        for (const value of candidates) {
          const before = (expected.shape as Record<string, z.ZodType>)[key].safeParse(
            value,
          )
          const after = (actual.shape as Record<string, z.ZodType>)[key].safeParse(
            value,
          )
          expect(after.success, `${name}.${key}: ${String(value)}`).toBe(before.success)
          if (before.success && after.success) expect(after.data).toEqual(before.data)
        }
      }
    })
  }
  it('retains the database hub role enum', () => {
    for (const role of [...Object.values(HubRoleType), 'unknown', null, undefined]) {
      expect(HubRoleFormData.shape.role.safeParse(role)).toEqual(
        HubRoleBase.shape.role.safeParse(role),
      )
    }
  })
})
