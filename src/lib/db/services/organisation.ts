// DRIZZLE
import { and, eq, SQL } from 'drizzle-orm';
// SVELTEKIT
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
// SCHEMA
import {
  feature,
  organisation,
  organisationI18n,
  organisationRole,
  project
} from '../schema';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { OrganisationAPI, OrganisationCollectionAPI, OrganisationUpdate } from '../zod';
// SERVICES
import { isFieldUnique, toLocaleMap, toRelatedRecords } from '..';
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud';
// TYPES
import type {
  OrganisationDB,
  OrganisationNew,
  Organisation,
  Id,
  Database,
  OrganisationDBNew,
  Locale,
  OrganisationI18nNew,
  OrganisationI18nPartial,
  OrganisationRoleNew,
  OrganisationDBPartial
} from '$lib/types';
import { HierarchicalResource } from '$lib/enums';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listOrganisations
//    - getOrganisation
//    - createOrganisation
//    - updateOrganisation
//
// 2. CRUD :: RELATIONAL OPERATIONS (OrganisationI18n)
//    - createI18n
//    - updateI18n
//
// 3. CRUD :: RELATIONAL OPERATIONS (OrganisationRole)
//    - createUserRoles
//    - updateUserRoles
//    - listUserRoles
//
// 4. CRUD :: ORCHESTRATION
//    - createOrganisationWithRelated
//    - updateOrganisationWithRelated
//
// 5. UTILS :: SHAPING
//    - toFormShape
//    - toResponseShape
//
// 6. UTILS :: LOOKUPS
//    - getOrganisationForFeatureId
//    - getOrganisationForProjectId
//

/********************
 *  1. CRUD :: CORE OPERATIONS
 ************/

export const listOrganisations = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = []
) =>
  await db.query.organisation.findMany({
    with: withRelations,
    where: and(...conditions)
  });

export const getOrganisation = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = []
) =>
  await db.query.organisation.findFirst({
    with: withRelations,
    where: and(...conditions)
  });

/**
 * Creates a new organisation in the database
 * @param db - The database instance
 * @param data - The organisation data to insert
 * @returns The newly created organisation
 * @throws {Error} If the organisation creation fails
 */
export const createOrganisation = async (db: Database, data: OrganisationDBNew) =>
  await insert(db, organisation, data);

/**
 * Updates an existing organisation in the database
 * @param db - The database instance
 * @param data - The updated organisation data
 * @param ref - The organisation code reference
 * @returns The updated organisation
 * @throws {Error} If the organisation update fails or organisation is not found
 */
export const updateOrganisation = async (
  db: Database,
  data: OrganisationDBPartial,
  ref: string
) => await update(db, organisation, data, organisation.code, ref);

// ═══════════════════════
// 2. CRUD :: RELATIONAL OPERATIONS (OrganisationI18n)
// ═══════════════════════

/**
 * Creates relational i18n records for an organisation
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, OrganisationI18nNew>,
  organisationId: string
) => {
  return await insertManyRelated(
    db,
    organisationI18n,
    toRelatedRecords(i18n, 'organisationId', organisationId, 'locale') as any,
    'organisationId',
    organisationId
  );
};

/**
 * Updates translations for an organisation by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, OrganisationI18nPartial>,
  organisationId: string
) => {
  return await replaceManyRelated(
    db,
    organisationI18n,
    toRelatedRecords(i18n, 'organisationId', organisationId, 'locale') as any,
    organisationI18n.organisationId,
    organisationId
  );
};

// ═══════════════════════
// 3. CRUD :: RELATIONAL OPERATIONS (OrganisationRole)
// ═══════════════════════

/**
 * Creates user roles for an organisation
 * @param db - The database instance
 * @param userRoles - Array of new user roles to create
 * @param organisationId - The ID of the organisation
 * @returns Array of created user roles with associated user information
 */
export const createUserRoles = async (
  db: Database,
  userRoles: OrganisationRoleNew[],
  organisationId: string
) => {
  return await insertManyRelated(
    db,
    organisationRole,
    userRoles,
    'organisationId',
    organisationId
  );
};

/**
 * Updates user roles for an organisation by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param userRoles - Array of user roles to update
 * @param organisationId - The ID of the organisation
 * @returns Array of updated user roles with associated user information
 */
export const updateUserRoles = async (
  db: Database,
  userRoles: OrganisationRoleNew[],
  organisationId: string
) => {
  return await replaceManyRelated(
    db,
    organisationRole,
    userRoles,
    organisationRole.organisationId,
    organisationId
  );
};

/**
 * Reads user roles for an organisation
 * @param db - The database instance
 * @param organisationId - The ID of the organisation
 * @returns Array of user roles with associated user information
 */
export const listUserRoles = async (db: Database, organisationId: string) => {
  return await db.query.organisationRole.findMany({
    with: {
      user: true
    },
    where: eq(organisationRole.organisationId, organisationId)
  });
};

// ═══════════════════════
// 4. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new organisation with translations and user roles
 * @param db - The database instance
 * @param data - The organisation data to insert
 * @returns The newly created organisation
 */
export const createOrganisationWithRelated = async (
  db: Database,
  data: OrganisationNew
) => {
  const organisation = await createOrganisation(db, data);
  const i18n = await createI18n(db, data.i18n, organisation.id);
  await createUserRoles(db, data.userRoles, organisation.id);
  const userRoles = await listUserRoles(db, organisation.id);
  // organisation.image is null upon creation
  // organisation.publisher is null upon creation, as it's unpublished by default.
  return { ...organisation, i18n, userRoles };
};

/**
 * Updates an organisation with translations and user roles
 * @param db - The database instance
 * @param data - The organisation data to insert
 * @param lookupCode - Optional code to lookup the organisation (defaults to data.code)
 * @returns The newly created organisation
 */
export const updateOrganisationWithRelated = async (
  db: Database,
  data: Organisation,
  lookupCode?: string
) => {
  const codeToUse = lookupCode || data.code;
  const organisation = await updateOrganisation(db, data, codeToUse);
  const i18n = await updateI18n(db, data.i18n, organisation.id);
  await updateUserRoles(db, data.userRoles, organisation.id);
  const userRoles = await listUserRoles(db, organisation.id);
  return { ...organisation, i18n, userRoles };
};

// ═══════════════════════
// 5. UTILS :: SHAPING
// ═══════════════════════

/**
 * Rebuilds form data from database entities
 * @param organisation - The organisation database entity
 * @param translations - Array of organisation translations
 * @param userRoles - Array of organisation user roles
 * @returns Validated form data
 */
export const toFormShape = async (
  organisation: OrganisationDB,
  i18n: OrganisationI18nNew[],
  userRoles: OrganisationRoleNew[]
): Promise<SuperValidated<Organisation>> => {
  const formData: Organisation = {
    ...organisation,
    // @ts-ignore - FORM : Fix Zod type error
    i18n: toLocaleMap<OrganisationI18nNew>(i18n),
    userRoles
  };
  // @ts-ignore - FORM : Fix Zod type error
  const form = await superValidate(formData, zod(OrganisationAPI));
  return form as SuperValidated<Organisation>;
};

export const toResponseShape = async (
  organisation: OrganisationDB,
  i18n: OrganisationI18nNew[],
  userRoles: OrganisationRoleNew[],
  isCollection: boolean = false
) => {
  const data: Organisation = {
    ...organisation,
    // @ts-ignore - FORM : Fix Zod type error
    i18n: toLocaleMap<OrganisationI18nNew>(i18n),
    userRoles
  };
  return isCollection
    ? OrganisationCollectionAPI.parse(data) as Organisation
    : OrganisationAPI.parse(data) as Organisation;
};

// ═══════════════════════
// 6. UTILS :: LOOKUPS
// ═══════════════════════

/**
 * Retrieves the organisation associated with a feature ID
 * @param db - The database instance
 * @param featureId - The ID of the feature
 * @returns The associated organisation or undefined if not found
 */
export const getOrganisationForFeatureId = async (
  db: Database,
  featureId: Id
): Promise<OrganisationDB | undefined> => {
  const record = await db.query.feature.findFirst({
    where: eq(feature.id, featureId),
    with: { layer: { with: { project: { with: { organisation: true } } } } }
  });
  return record?.layer?.project?.organisation || undefined;
};

/**
 * Retrieves the organisation associated with a project ID
 * @param db - The database instance
 * @param projectId - The ID of the project
 * @returns The associated organisation or undefined if not found
 */
export const getOrganisationForProjectId = async (
  db: Database,
  projectId: Id
): Promise<OrganisationDB | undefined> => {
  const record = await db.query.project.findFirst({
    where: eq(project.id, projectId),
    with: { organisation: true }
  });
  return record?.organisation || undefined;
};


