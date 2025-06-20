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
const UserPreferencesSchema = z.object({
  fallbackLocales: z.array(z.string()),
  allowMachineTranslation: z.boolean(),
  preferFallbackInCurrentLocale: z.boolean(),
  isTranslateButtonVisible: z.boolean(),
  admin: z
    .object({
      isAdminMapCollapsed: z.boolean().optional(),
      isPrimaryPanelAutoHide: z.boolean().optional()
    })
    .optional()
});

const UserExperimentalSchema = z.object({
  contributorMode: z.boolean(),
  noLabelsMode: z.boolean()
});

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
  // Override JSON fields with proper types
  preferences: UserPreferencesSchema,
  experimental: UserExperimentalSchema
});
export const UserUpdate = createUpdateSchema(user);
