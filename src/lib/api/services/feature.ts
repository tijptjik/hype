// MAPS
import subNeighbourhoods from '$lib/map/subNeighbourhoods.json';
// DRIZZLE
import { eq, inArray, SQL, sql } from 'drizzle-orm';
// LIB
import { isAdminRequest } from '../index';
// API
import { applyQueryFilters, removeExcludedColumns } from '$lib/api';
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  runAssertions,
  assertProjectMaintainerOrSuperAdmin,
  assertParamIdentifierEqualsFormIdentifier
} from '$lib/auth/asserts';
// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';
import { getProjectIdforRoles, isSuperAdmin } from '$lib/client/services/auth';
// SCHEMA
import { feature, layer } from '$lib/db/schema/index';
// DB
import { applyPrismConstraints, transformI18nSafely } from '$lib/db';
import { HierarchicalResource } from '$lib/enums';
import { getProjectIdForFeature } from '$lib/db/services/feature';
// FEATURE DB SERVICES
import { createFeatureWithRelated } from '$lib/db/services/feature';
// ZOD
import { FeatureInsertAPI } from '$lib/db/zod/schema/feature';
// ENUMS
import { supportedLocales } from '$lib/enums';
// TYPES
import type {
  UserRoleDisco,
  Prisms,
  FeatureDBNew,
  Database,
  Id,
  SessionUser,
  FeatureNew,
  QueryParams,
  UserContributedFeature,
  Locale
} from '$lib/types';

/********************
 *  COMMON
 ************/
export const featureCollectionWithRelations = {
  i18n: true,
  properties: {
    with: {
      i18n: true
    }
  }
};

export const featureEntityWithRelations = {
  ...featureCollectionWithRelations,
  contributor: {
    columns: userColumnsWithPrivacyProtected
  },
  publisher: {
    columns: userColumnsWithPrivacyProtected
  },
  images: {
    with: {
      image: {
        with: {
          contributor: true
        }
      }
    }
  }
};

/********************
 *  QUERY CONTEXT
 ************/

/**
 * Get the query context for the feature resource.
 * Filters the query based on user roles, prisms, and query parameters.
 * @param db - The Drizzle instance
 * @param user - The user object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 * @param prisms - The prism filters
 */
export const getFeatureQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms
) => {
  // SETUP : By default, only show non-archived features,
  // and disable isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = [];
  const excludeColumns = ['isArchived', 'isPublished'];

  // NON-SUPERADMIN : Hide features which are archived
  if (!isSuperAdmin(user) || !isAdminRequest(request)) {
    conditions.push(eq(feature.isArchived, false));
  }

  // FILTER : Apply prism conditions for organisation, project, and layer filtering
  if (prisms && db) {
    conditions.push(...applyPrismConstraints(db, HierarchicalResource.feature, prisms));
  }

  // PUBLIC : List all features which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns);
    conditions.push(eq(feature.isPublished, true));

    // ADMIN : List all features, where the user has a role in the feature's layer's project
  } else if (!isSuperAdmin(user)) {
    params = removeExcludedColumns(params, ['isArchived']); // Keep isPublished filterable for admins
    const projectIds = getProjectIdforRoles(userRoles);
    if (projectIds.length > 0) {
      const layerIdsWithProjectAccess = db
        .select({ id: layer.id })
        .from(layer)
        .where(inArray(layer.projectId, projectIds as Id[]));
      conditions.push(inArray(feature.layerId, layerIdsWithProjectAccess));
    } else {
      conditions.push(sql`false`);
    }
  } else {
    // For SuperAdmin, if no prisms are applied, conditions must be empty.
    if (!(prisms && db)) {
      conditions = []; // List all layers without the default isArchived filter
    }
  }

  if (Object.keys(params).length > 0) {
    // For superAdmins, remove isArchived and isPublished from params so they can see all content
    if (isSuperAdmin(user)) {
      const { isArchived, isPublished, ...filteredParams } = params;
      applyQueryFilters(feature, filteredParams, conditions);
    } else {
      applyQueryFilters(feature, params, conditions);
    }
  }

  return { params, conditions, excludeColumns };
};

/********************
 *  QUERY UTILITIES
 ************/

// TODO Remove this once neighbourhoods and places are properly implemented as
// first-class entities.

/**
 * Expands neighbourhoods to include all sub-districts.
 * @param queryParams - The query parameters
 * @returns The query parameters with expanded neighbourhoods
 */
export function withExpandedNeighbourhoods(queryParams: QueryParams) {
  const params = { ...queryParams };
  const neighbourhoodKey = 'addressProperties.neighbourhood';

  if (neighbourhoodKey in params) {
    // Convert single value to array if necessary
    const neighbourhoods = Array.isArray(params[neighbourhoodKey])
      ? (params[neighbourhoodKey] as string[])
      : [params[neighbourhoodKey] as string];

    // Create a Set to avoid duplicates
    const expandedNeighbourhoods = new Set<string>();

    // For each provided neighbourhood
    neighbourhoods.forEach((hood) => {
      // Always add the original neighbourhood
      expandedNeighbourhoods.add(hood);

      // If it's a main district, also add all its sub-districts
      if (hood in subNeighbourhoods) {
        subNeighbourhoods[hood as keyof typeof subNeighbourhoods].forEach((n) =>
          expandedNeighbourhoods.add(n)
        );
      }
    });

    // Update the params with expanded array
    params[neighbourhoodKey] = Array.from(expandedNeighbourhoods);
  }
  return params;
}

/********************
 *  ASSERTIONS
 ************/

/**
 * Asserts permissions to create a feature.
 * @param db - The Drizzle instance
 * @param user - The user object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns An error object if the permissions are not met, otherwise undefined
 */
export const assertPermissionsToCreateFeature = async (
  db: Database,
  user: SessionUser,
  request: Request,
  locals: App.Locals,
  formData: FeatureDBNew,
  userRoles: UserRoleDisco[]
) => {
  const projectId = await getProjectIdForFeature(db, formData, locals.hub);

  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertProjectMaintainerOrSuperAdmin(user, userRoles, projectId!)
  );

  if (assertionError) return assertionError;
};

/**
 * Asserts permissions to update a feature.
 * @param db - The Drizzle instance
 * @param session - The session object
 * @param request - The request object
 * @param locals - The app locals
 * @param formData - The form data
 * @param userRoles - The user roles
 * @param refId - The id from the URL parameter
 * @returns An error object if the permissions are not met, otherwise undefined
 */
export const assertPermissionsToUpdateFeature = async (
  db: Database,
  user: SessionUser,
  request: Request,
  locals: App.Locals,
  formData: FeatureNew,
  userRoles: UserRoleDisco[],
  refId: Id
) => {
  const projectId = await getProjectIdForFeature(db, formData, locals.hub);

  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier(formData, refId, 'id'),
    () => assertProjectMaintainerOrSuperAdmin(user, userRoles, projectId!)
  );

  if (assertionError) return assertionError;
};

// ═══════════════════════
// FEATURE CREATION WITH ENRICHMENT
// ═══════════════════════

/**
 * Creates a feature from user-contributed data with enrichment and translation
 * @param db - The database instance
 * @param newFeature - The user-contributed feature data
 * @param subscriptionKey - Azure translation API key
 * @returns The newly created feature with related data
 */
export const createUserContributedFeature = async (
  db: Database,
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string
) => {
  // Step 1: Get the source locale (first locale with content)
  const providedLocales = Object.keys(newFeature.i18n) as Locale[];

  if (providedLocales.length === 0) {
    throw new Error('At least one locale must have content');
  }

  const sourceLocale = providedLocales[0];
  const sourceTextObj = newFeature.i18n[sourceLocale];

  if (!sourceTextObj?.title) {
    throw new Error('Source locale must have a title');
  }

  // Step 2: Create enriched i18n textObject with all locales
  const enrichedI18n: Partial<Record<Locale, any>> = {};

  for (const locale of supportedLocales) {
    const textObj = newFeature.i18n[locale];
    const isSourceLocale = locale === sourceLocale;

    if (isSourceLocale) {
      // For source locale, preserve original values and set Gen flags to false
      enrichedI18n[locale as Locale] = {
        locale: locale,
        title: sourceTextObj.title,
        description: sourceTextObj.description || null,
        displayAddress: sourceTextObj.displayAddress || null,
        titleGen: false, // Original content, not generated
        descriptionGen: false,
        displayAddressGen: false,
        addressProperties: {}
      };
    } else {
      // For target locales, determine what needs translation
      const needsTitle = Boolean(sourceTextObj.title);
      const needsDescription = Boolean(sourceTextObj.description);
      const needsDisplayAddress = Boolean(sourceTextObj.displayAddress);

      // Collect fields that need translation (only non-empty source values)
      const fieldsToTranslate: string[] = [];
      if (needsTitle) fieldsToTranslate.push(sourceTextObj.title);
      if (needsDescription) fieldsToTranslate.push(sourceTextObj.description!);
      if (needsDisplayAddress) fieldsToTranslate.push(sourceTextObj.displayAddress!);

      let translatedValues: string[] = [];

      // Only call translation API if we have fields to translate and API key
      if (fieldsToTranslate.length > 0 && subscriptionKey) {
        // TRANSLATION
        const { translateText } = await import('$lib/api/external/translation');
        try {
          translatedValues = await translateText(
            fieldsToTranslate,
            sourceLocale,
            locale,
            region,
            subscriptionKey
          );
        } catch (error) {
          console.error(`Translation failed for ${sourceLocale} -> ${locale}:`, error);
          // translatedValues remains empty array, will fall back to source content
        }
      }

      // Build the enriched object with proper field-level tracking
      let translationIndex = 0;

      // Extract translated values in order
      const translatedTitle =
        needsTitle && translationIndex < translatedValues.length
          ? translatedValues[translationIndex++]
          : null;
      const translatedDescription =
        needsDescription && translationIndex < translatedValues.length
          ? translatedValues[translationIndex++]
          : null;
      const translatedDisplayAddress =
        needsDisplayAddress && translationIndex < translatedValues.length
          ? translatedValues[translationIndex++]
          : null;

      enrichedI18n[locale as Locale] = {
        locale: locale,
        title: translatedTitle || sourceTextObj.title,
        description: translatedDescription || sourceTextObj.description || null,
        displayAddress:
          translatedDisplayAddress || sourceTextObj.displayAddress || null,
        titleGen: Boolean(translatedTitle), // True if translation was provided
        descriptionGen: Boolean(translatedDescription), // True if translation was provided
        displayAddressGen: Boolean(translatedDisplayAddress), // True if translation was provided
        addressProperties: {}
      };
    }
  }

  // Step 3: Process translatable properties
  const enrichedProperties = await Promise.all(
    (newFeature.properties || []).map(async (prop) => {
      // If property has i18n content, enrich it like we do for feature-level fields
      if (prop.i18n) {
        const propProvidedLocales = Object.keys(prop.i18n) as Locale[];
        if (propProvidedLocales.length === 0) {
          return prop; // No i18n content, return as-is
        }

        const propSourceLocale = propProvidedLocales[0];
        const propSourceTextObj = prop.i18n[propSourceLocale];

        if (!propSourceTextObj?.value) {
          return prop; // No source value, return as-is
        }

        // Create enriched property i18n
        const enrichedPropertyI18n: Partial<Record<Locale, any>> = {};

        for (const locale of supportedLocales) {
          const propTextObj = prop.i18n[locale];
          const isSourceLocale = locale === propSourceLocale;

          if (isSourceLocale) {
            // For source locale, preserve original value and set Gen flag to false
            enrichedPropertyI18n[locale] = {
              locale: locale,
              value: propSourceTextObj.value,
              valueGen: false // Original content, not generated
            };
          } else {
            // For target locales, determine if translation is needed
            const needsValue = Boolean(propSourceTextObj.value);

            let translatedValue: string | null = null;

            // Only translate if needed and API key available
            if (needsValue && subscriptionKey) {
              try {
                const { translateText } = await import('$lib/api/external/translation');
                const translatedValues = await translateText(
                  [propSourceTextObj.value],
                  propSourceLocale,
                  locale,
                  region,
                  subscriptionKey
                );
                translatedValue = translatedValues[0] || null;
              } catch (error) {
                // Translation failed, translatedValue remains null
              }
            }

            enrichedPropertyI18n[locale] = {
              locale: locale,
              value: translatedValue || propSourceTextObj.value,
              valueGen: Boolean(translatedValue) // True if translation was provided
            };
          }
        }

        return {
          ...prop,
          i18n: transformI18nSafely(enrichedPropertyI18n)
        };
      }

      return prop; // Non-translatable property, return as-is
    })
  );

  // Step 4: Create the enriched feature object
  const enrichedFeature = {
    ...newFeature,
    isPendingReview: true, // User-contributed features should be marked for review
    i18n: transformI18nSafely(enrichedI18n as Record<Locale, any>),
    properties: enrichedProperties
  };

  // Step 5: Use Zod to parse and apply all defaults
  const validatedFeature = FeatureInsertAPI.parse(enrichedFeature);

  // Step 6: Create the feature with all related data
  const result = await createFeatureWithRelated(db, validatedFeature);
  return result;
};
