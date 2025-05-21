import { z } from 'zod';
import { m } from '$lib/i18n';
import { supportedLocales } from '$lib/enums';
import type {
  feature,
  layerI18n,
  layer,
  property,
  organisation,
  project,
  organisationI18n,
  projectI18n,
  featureI18n,
  propertyI18n
} from '../schema';

/* ----------------- */
// CONSTRAINTS
/* -------- */

export const constraints: Record<string, z.ZodType<any>> = {
  code: z
    .string()
    .min(1, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_code_valid_characters()
    }),
  name: z
    .string()
    .min(1, { message: m.admin__validation_name_is_required() })
    .max(128, { message: m.admin__validation_name_lte_128_chars() }),
  title: z
    .string()
    .min(1, { message: m.admin__validation_name_is_required() })
    .max(128, { message: m.admin__validation_name_lte_128_chars() }),
  nameShort: z
    .string()
    .min(1, { message: m.admin__validation_short_name_is_required() })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  description: z
    .string()
    .max(1024, { message: m.admin__validation_description_lte_1024_chars() })
    .optional()
    .nullish()
    .transform((x) => x ?? undefined),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters()
    })
    .min(2, { message: m.admin__validation_key_gte_2_chars() }),
  url: z
    .string()
    .url({ message: m.admin__validation_url_invalid() })
    .optional()
    .nullish()
    .transform((x) => x ?? undefined),
  attribution: z
    .string()
    .min(1, { message: m.admin__validation_attribution_is_required() })
    .max(128, { message: m.admin__validation_attribution_lte_128_chars() })
};

export const getDefaultConstraints = (
  table:
    | typeof organisation
    | typeof organisationI18n
    | typeof project
    | typeof projectI18n
    | typeof layer
    | typeof layerI18n
    | typeof property
    | typeof propertyI18n
    | typeof feature
    | typeof featureI18n
) => {
  return Object.keys(table).reduce(
    (acc, key) => {
      if (key in constraints) {
        acc[key] = constraints[key as keyof typeof constraints];
      }
      return acc;
    },
    {} as Record<string, z.ZodType<any>>
  );
};

/* ----------------- */
// UTILITY FUNCTIONS
/* -------- */

export function createRequiredObjSchema<K extends string, V extends z.ZodTypeAny>(
  keysSchema: z.ZodEnum<[K, ...K[]]>,
  valueSchema: V
) {
  return z
    .record(keysSchema, valueSchema)
    .refine((obj): obj is Record<K, z.infer<V>> =>
      keysSchema.options.every((key) => obj[key] != null)
    );
}

// TODO - It looks like this is stripping the validation messages for the default values
// e.g. organisaiton.name should render as m.admin__validation_name_is_required() but instead renders "required".
export const getLocales = (model: z.ZodType<any>) =>
  createRequiredObjSchema(z.enum(supportedLocales), model).default({
    en: { locale: 'en' },
    'zh-hant': { locale: 'zh-hant' },
    'zh-hans': { locale: 'zh-hans' }
  });

export const getUserRoles = (model: z.ZodType<any>) =>
  z
    .array(model)
    .refine((schema) => schema.length > 0, 'Add a User')
    .refine(
      (schema) => schema.map((user) => user.role).some((role) => role === 'owner'),
      m.admin__validation_user_roles_at_least_one_owner()
    );

// TODO - Test the addition / removal of maintainer roles while maintaining and / or removing the owner
export const getMaintainerRoles = (model: z.ZodType<any>) =>
  z
    .array(model)
    .refine((schema) => schema.length > 0, m.plain_top_dingo_strive())
    .refine(
      (schema) => schema.map((user) => user.role).some((role) => role === 'maintainer'),
      m.admin__validation_user_roles_at_least_one_maintainer()
    );
