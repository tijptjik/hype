import { z } from 'zod';
import { m } from '$lib/i18n';
import { supportedLocales } from '$lib/enums';
import type {
  feature,
  featureI18n,
  hub,
  hubI18n,
  layer,
  layerI18n,
  organisation,
  organisationI18n,
  project,
  projectI18n,
  property,
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
    .max(8192, { message: m.admin__validation_description_lte_1024_chars() })
    .nullish(),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters()
    })
    .min(2, { message: m.admin__validation_key_gte_2_chars() }),
  url: z
    .string()
    .url({ message: m.admin__validation_url_invalid() })
    .nullish(),
  attribution: z
    .string()
    .min(1, { message: m.admin__validation_attribution_is_required() })
    .max(128, { message: m.admin__validation_attribution_lte_128_chars() }),
  label: z
    .string()
    .min(1, { message: 'Label is required' })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  placeholder: z
    .string()
    .max(128, { message: m.admin__validation_attribution_lte_128_chars() })
    .nullish()
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
    | typeof hub
    | typeof hubI18n
) => {
  return Object.keys(table).reduce(
    (acc: Record<string, any>, key) => {
      if (key in constraints) {
        acc[key] = constraints[key as keyof typeof constraints];
      }
      return acc;
    },
    {}
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
export const getLocales = (model: z.ZodType<any>, requiredStringKeys: string[] = [
    'value',
    'label'
  ]) =>
  z.record(z.enum(supportedLocales as [string, ...string[]]), model)
    .optional()
    .nullable()
    .refine(
      (i18nObject) => {
        // If i18n is null or undefined, that's valid
        if (!i18nObject) {
          return true;
        }

        // If i18n exists, validate only the locales that are present
        return Object.entries(i18nObject).every(([locale, localeSpecificObject]) => {
          if (!localeSpecificObject) {
            return true;
          }

          return requiredStringKeys.every((key) => {
            if (!(key in localeSpecificObject)) {
              return true;
            }
            const value = localeSpecificObject[key];
            if (typeof value === 'string') {
              return value.trim() !== '';
            }
            return true;
          });
        });
      },
      {
        message: m.civil_stale_jurgen_link() // Assuming you have a suitable message key
      }
    );

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
