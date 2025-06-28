// ZOD
import { z } from 'zod';
// DRIZZLE
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod';
// DRIZZLE SCHEMA
import { user } from '$lib/db/schema/user';
// CONSTRAINTS
// import { FeatureBase } from './feature';

/* ============================================================================
 * USER SCHEMAS
 * ============================================================================
 */

// Define JSON object schemas for user fields
const UserPreferencesSchema = z
  .object({
    fallbackLocales: z.array(z.string()).nullish(),
    allowMachineTranslation: z.boolean().nullish(),
    preferFallbackInCurrentLocale: z.boolean().nullish(),
    isTranslateButtonVisible: z.boolean().nullish(),
    admin: z
      .object({
        isAdminMapCollapsed: z.boolean().optional(),
        isPrimaryPanelCollapsed: z.boolean().optional(),
        isPrimaryPanelAutoHide: z.boolean().optional()
      })
      .nullish()
  })
  .default({
    fallbackLocales: ['en'],
    allowMachineTranslation: false,
    preferFallbackInCurrentLocale: false,
    isTranslateButtonVisible: true,
    admin: {}
  });

const UserExperimentalSchema = z
  .object({
    contributorMode: z.boolean().nullish(),
    noLabelsMode: z.boolean().nullish()
  })
  .default({
    contributorMode: false,
    noLabelsMode: false
  })
  .nullish();

export const UserBase = createSelectSchema(user);
export const UserBasic = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true
} as const);
export const UserCurrent = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true,
  locale: true,
  preferences: true,
  experimental: true
} as const).extend({
  // Override JSON fields with proper types - transform strings to objects
  preferences: z.string().transform((str) => {
    try {
      const parsed = JSON.parse(str);
      return UserPreferencesSchema.parse(parsed);
    } catch {
      return UserPreferencesSchema.parse({});
    }
  }),
  experimental: z.string().transform((str) => {
    try {
      const parsed = JSON.parse(str);
      return UserExperimentalSchema.parse(parsed);
    } catch {
      return UserExperimentalSchema.parse({});
    }
  })
});
export const UserUpdate = createUpdateSchema(user);
