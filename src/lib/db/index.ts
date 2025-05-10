import { error } from '@sveltejs/kit';
// ORM
import { drizzle } from 'drizzle-orm/d1';
import {
  Table,
  getTableName,
  and,
  sql,
  inArray,
  eq,
  or,
  not,
  exists,
  ilike,
  SQL
} from 'drizzle-orm';
// SCHEMA
import * as schema from './schema';
// TYPES
import type { D1Database } from '@auth/d1-adapter';
import type { Database } from './services/organisation';
import type {
  TargetLang,
  Field,
  NestedRelations,
  Ref,
  Resource,
  ResourceDB,
  ResourceType,
  LanguageTag
} from '../types';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

export const targetLanguageTags: LanguageTag[] = ['zh-hant', 'zh-hans'];

export const NEW_TITLE = 'New';
export const NEW_REF = NEW_TITLE.toLowerCase();

// ACCESS CONTROL
export const publicAccessOptions = ['Public', 'SuperAdmin', 'ResourceAll', 'EntityAny'];
export const relationalAccessOptions = [
  'EntityFromEditableProject',
  'EntityFromEditableOrganisation',
  'ResourceFromEditableProject',
  'ResourceFromEditableOrganisation'
];

const client = (database: D1Database) => {
  return drizzle(database, {
    schema,
    logger: import.meta.env?.VITE_DRIZZLE_LOGGER === 'true' || false
  });
};

// CONFIG
export const resourceConfig = {
  feature: {
    name: 'feature',
    table: schema.feature,
    parentName: 'layer',
    parentTable: schema.layer,
    keyToParent: 'layerId',
    keyToSelf: 'featureId',
    depth: 3
  },
  layer: {
    name: 'layer',
    table: schema.layer,
    parentName: 'project',
    parentTable: schema.project,
    keyToParent: 'projectId',
    keyToSelf: 'layerId',
    depth: 2
  },
  project: {
    name: 'project',
    table: schema.project,
    parentName: 'organisation',
    parentTable: schema.organisation,
    keyToParent: 'organisationId',
    keyToSelf: 'projectId',
    depth: 1
  },
  organisation: {
    name: 'organisation',
    table: schema.organisation,
    parentName: null,
    parentTable: null,
    keyToParent: null,
    keyToSelf: 'organisationId',
    depth: 0
  }
};

const resourceHierarchy = Object.values(resourceConfig);

// UTILITY
const getTable = (slicedHierarchy: typeof resourceHierarchy, index: number) =>
  slicedHierarchy[index].table;
const getForeignKey = (slicedHierarchy: typeof resourceHierarchy, index: number) =>
  slicedHierarchy[index].keyToParent as string;
const getReverseForeignKey = (
  slicedHierarchy: typeof resourceHierarchy,
  index: number
) => slicedHierarchy[index].keyToSelf;

const applyGenericAccessStrategy = (
  db: any,
  accessStrategy: string,
  userTable?: Table,
  userId?: string
) => {
  if (publicAccessOptions.includes(accessStrategy)) {
    return [];
  }
  // TODO restricting access by project maintainer / organisation admin
  if (relationalAccessOptions.includes(accessStrategy)) {
    return [];
  }
  throw new Error('Invalid access strategy');
};

const applyAccessStrategy = (
  db: any,
  accessStrategy: string,
  slicedHierarchy: typeof resourceHierarchy,
  userTable?: Table,
  userId?: string
) => {
  if (publicAccessOptions.includes(accessStrategy)) {
    return [];
  }
  if (!userTable || !userId) {
    throw new Error('User table or user ID is required');
  }

  const conditions = [];
  const table0 = getTable(slicedHierarchy, 0);
  const reverseFK0 = getReverseForeignKey(slicedHierarchy, 0);

  switch (accessStrategy) {
    case 'ResourceOwn':
    case 'EntityOwn':
      conditions.push(
        inArray(
          table0.id,
          db
            .select({ id: userTable[reverseFK0] })
            .from(userTable)
            .where(
              and(eq(userTable[reverseFK0], table0.id), eq(userTable.userId, userId))
            )
        )
      );
      break;
    case 'ResourceOwnChildren':
    case 'EntityOwnChild':
      conditions.push(
        inArray(
          table0[getForeignKey(slicedHierarchy, 0)],
          db
            .select({ id: getTable(slicedHierarchy, 1).id })
            .from(getTable(slicedHierarchy, 1))
            .innerJoin(
              userTable,
              eq(
                userTable[getReverseForeignKey(slicedHierarchy, 1)],
                getTable(slicedHierarchy, 1).id
              )
            )
            .where(eq(userTable.userId, userId))
        )
      );
      break;
    case 'ResourceOwnGrandChildren':
    case 'EntityOwnGrandChild':
      conditions.push(
        inArray(
          table0[getForeignKey(slicedHierarchy, 0)],
          db
            .select({ id: getTable(slicedHierarchy, 1).id })
            .from(getTable(slicedHierarchy, 1))
            .innerJoin(
              getTable(slicedHierarchy, 2),
              eq(
                getTable(slicedHierarchy, 1)[getForeignKey(slicedHierarchy, 1)],
                getTable(slicedHierarchy, 2).id
              )
            )
            .innerJoin(
              userTable,
              eq(
                userTable[getReverseForeignKey(slicedHierarchy, 2)],
                getTable(slicedHierarchy, 2).id
              )
            )
            .where(eq(userTable.userId, userId))
        )
      );
      break;
    default:
      throw new Error('Invalid access strategy');
  }
  return conditions;
};

const applyTranslationCondition = (
  db: any,
  slicedHierarchy: typeof resourceHierarchy,
  translationTable: Table | boolean
) => {
  if (!translationTable || typeof translationTable === 'boolean') return [];

  const table0 = getTable(slicedHierarchy, 0);
  const reverseFK0 = getReverseForeignKey(slicedHierarchy, 0);

  return [
    inArray(
      table0.id,
      db
        .select({ id: translationTable[reverseFK0] })
        .from(translationTable)
        .where(eq(translationTable[reverseFK0], table0.id))
    )
  ];
};

const createLevelQuery = (
  db: any,
  slicedHierarchy: typeof resourceHierarchy,
  levelUp: number,
  prisms: any
) => {
  const conditions = [];
  const baseQuery = db
    .select({ id: getTable(slicedHierarchy, levelUp).id })
    .from(getTable(slicedHierarchy, levelUp));

  if (levelUp > 0) {
    conditions.push(
      inArray(
        getTable(slicedHierarchy, levelUp).id,
        prisms[slicedHierarchy[levelUp].name] || []
      )
    );
  }

  if (levelUp > 1) {
    conditions.push(
      not(
        exists(
          db
            .select({ id: getTable(slicedHierarchy, levelUp - 1).id })
            .from(getTable(slicedHierarchy, levelUp - 1))
            .where(
              and(
                eq(
                  getTable(slicedHierarchy, levelUp - 1)[
                    getForeignKey(slicedHierarchy, levelUp - 1)
                  ],
                  getTable(slicedHierarchy, levelUp).id
                ),
                inArray(
                  getTable(slicedHierarchy, levelUp - 1).id,
                  prisms[slicedHierarchy[levelUp - 1].name] || []
                )
              )
            )
        )
      )
    );
  }

  if (levelUp > 2) {
    conditions.push(
      not(
        exists(
          db
            .select({
              id: sql<string>`${getTable(slicedHierarchy, levelUp - 2).id}`.as('id')
            })
            .from(getTable(slicedHierarchy, levelUp - 1))
            .innerJoin(
              getTable(slicedHierarchy, levelUp - 2),
              eq(
                getTable(slicedHierarchy, levelUp - 2)[
                  getForeignKey(slicedHierarchy, levelUp - 2)
                ],
                getTable(slicedHierarchy, levelUp - 1).id
              )
            )
            .where(
              and(
                eq(
                  getTable(slicedHierarchy, levelUp - 1)[
                    getForeignKey(slicedHierarchy, levelUp - 1)
                  ],
                  getTable(slicedHierarchy, levelUp).id
                ),
                inArray(
                  getTable(slicedHierarchy, levelUp - 2).id,
                  prisms[slicedHierarchy[levelUp - 2].name] || []
                )
              )
            )
        )
      )
    );
  }

  return baseQuery.where(and(...conditions));
};

const applyFilterConstraints = (
  db: any,
  slicedHierarchy: typeof resourceHierarchy,
  depth: number,
  prisms: any
) => {
  if (!Object.values(prisms).some((arr) => arr.length > 0)) return [];

  const subQueries = [];
  for (let levelUp = 1; levelUp < depth; levelUp++) {
    const baseLevelQuery = db.$with(`level_min_${levelUp}`);
    subQueries.push(
      baseLevelQuery.as(createLevelQuery(db, slicedHierarchy, levelUp, prisms))
    );
  }

  let baseQuery = db.with(...subQueries);
  baseQuery = baseQuery
    .select({ id: getTable(slicedHierarchy, 0).id })
    .from(getTable(slicedHierarchy, 0));

  const subQueryConditions = [];

  for (let i = 1; i < depth; i++) {
    baseQuery = baseQuery.innerJoin(
      getTable(slicedHierarchy, i),
      eq(
        getTable(slicedHierarchy, i - 1)[getForeignKey(slicedHierarchy, i - 1)],
        getTable(slicedHierarchy, i).id
      )
    );
    subQueryConditions.push(
      sql`${getTable(slicedHierarchy, i).id} IN (SELECT id FROM ${`level_min_${i}`})`.inlineParams()
    );
  }

  return [
    inArray(getTable(slicedHierarchy, 0).id, baseQuery.where(or(...subQueryConditions)))
  ];
};

const applyQueryConstraints = (table: Table, query: string, filterFields: string[]) => {
  if (!query) return [];
  const results = or(
    ...filterFields.map(
      (field) => sql`${table[field]} LIKE ${'%' + query.replace('%', '') + '%'}`
    )
  );
  return results;
};

export async function genericResourceQuery(
  db: any,
  table: Table,
  query: string,
  filterFields: string[] = ['name'],
  accessStrategy: string = 'ResourceAll',
  columns: Record<string, boolean> = {},
  selectTableRelations: Record<string, boolean | object> = {}
) {
  const conditions = [];

  if (query && filterFields.length > 0) {
    conditions.push(applyQueryConstraints(table, query, filterFields));
  }

  return await db.query[getTableName(table)].findMany({
    where: and(...conditions),
    columns: columns,
    with: selectTableRelations
  });
}

export type ResourceConfig = {
  name: string;
  table: Table;
  parentName: string | null;
  parentTable: Table | null;
  keyToParent: string | null;
  keyToSelf: string;
  depth: number;
};

export type ResourceHierarchy = ResourceConfig[];

const createJsonPathCondition = (
  table: Table,
  path: string[],
  value: string | string[]
) => {
  const [baseColumn, ...jsonPath] = path;
  const jsonPathStr = jsonPath.map((p) => `$.${p}`).join('.');

  // Handle array of values
  if (Array.isArray(value)) {
    return sql`json_extract(${table[baseColumn]}, ${jsonPathStr}) IN (${sql.join(
      value.map((v) => sql`${v}`),
      sql`, `
    )})`;
  }

  // Handle boolean values
  if (value === 'true' || value === 'false') {
    return sql`json_extract(${table[baseColumn]}, ${jsonPathStr}) = ${value === 'true'}`;
  }

  // Handle single value
  return sql`json_extract(${table[baseColumn]}, ${jsonPathStr}) = ${value}`;
};

const applyPublishedConstraints = (
  db: any,
  slicedHierarchy: typeof resourceHierarchy,
  depth: number
) => {
  const conditions: SQL[] = [];

  const currentTable = getTable(slicedHierarchy, 0);
  let query = db.select({ id: currentTable.id }).from(currentTable);

  if (depth > 1) {
    for (let i = 0; i < depth - 1; i++) {
      const childTable = getTable(slicedHierarchy, i);
      const parentTable = getTable(slicedHierarchy, i + 1);
      const fk = getForeignKey(slicedHierarchy, i);
      query = query.innerJoin(parentTable, eq(childTable[fk], parentTable.id));
    }

    // Add condition to check isPublished for all tables in the chain
    const publishedConditions = [];
    for (let j = 0; j < depth; j++) {
      const table = getTable(slicedHierarchy, j);
      if ('isPublished' in table) {
        publishedConditions.push(eq(table.isPublished as SQLiteColumn, true));
      }
    }

    // Add condition to check if the current record exists in the query
    conditions.push(inArray(currentTable.id, query.where(and(...publishedConditions))));
  } else {
    conditions.push(eq(currentTable.isPublished as SQLiteColumn, true));
  }

  return conditions;
};

export async function hierarchicalResourceQuery<
  usersT extends Table,
  translationsT extends Table
>(
  db: any,
  accessStrategy: string = 'ResourceOwn',
  selectTableRelations: Record<string, boolean | object> = {},
  userId: string,
  userTable: usersT,
  translationTable: translationsT | boolean,
  prisms: Record<string, string[]> = {},
  depth: number = 1,
  filters?: Record<string, string | string[]>,
  hierarchy?: ResourceHierarchy
) {
  const resourceHierarchy = hierarchy || Object.values(resourceConfig);
  const slicedHierarchy = resourceHierarchy.slice(-depth, resourceHierarchy.length);
  const table = getTable(slicedHierarchy, 0);

  const conditions = [
    ...applyAccessStrategy(db, accessStrategy, slicedHierarchy, userTable, userId),
    ...applyTranslationCondition(db, slicedHierarchy, translationTable),
    ...applyFilterConstraints(db, slicedHierarchy, depth, prisms),
    ...(accessStrategy === 'Public'
      ? applyPublishedConstraints(db, slicedHierarchy, depth)
      : [])
  ];

  if (filters) {
    const filterConditions = Object.entries(filters).map(([column, value]) => {
      // Check if this is a nested path
      const path = column.split('.');

      if (path.length > 1) {
        return createJsonPathCondition(table, path, value);
      }

      // Handle Boolean values
      if (Array.isArray(value) && (value[0] === 'true' || value[0] === 'false')) {
        return eq(table[column], value[0] === 'true');
      }

      // Handle Array values
      if (Array.isArray(value)) {
        return inArray(table[column], value);
      }

      // Handle non-array values
      return eq(table[column], value);
    });
    conditions.push(...filterConditions);
  }

  return await db.query[getTableName(table)].findMany({
    where: and(...conditions),
    with: selectTableRelations
  });
}

function findUserJoinTables(relations: NestedRelations): string[] {
  const userJoinTables: string[] = [];

  function traverse(obj: NestedRelations, path: string[] = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && 'with' in value) {
        if ('user' in value.with) {
          userJoinTables.push(key);
        }
        traverse(value.with, [...path, key]);
      }
    }
  }

  traverse(relations);
  return userJoinTables;
}

export async function genericEntityQuery<usersT extends Table>(
  db: any,
  ref: string,
  table: Table,
  publicIdentifier: string = 'id',
  accessStrategy: string = 'EntityOwn',
  selectTableRelations: NestedRelations,
  userId?: string,
  userTable?: usersT,
  columns?: Record<string, boolean>
) {
  // NEW is a reserved keyword for new entities
  if (ref == NEW_REF) {
    throw new Error('The old shall never be new again');
  }
  const conditions = [
    eq(table[publicIdentifier], ref),
    ...applyGenericAccessStrategy(db, accessStrategy, userTable, userId)
  ];

  const queryOpts = {
    where: and(...conditions),
    with: selectTableRelations
  };
  if (columns) {
    queryOpts.columns = columns;
  }
  return await db.query[getTableName(table)].findFirst(queryOpts);
}

// Define the shape of a translation object
interface Translation {
  lang: TargetLang;
  [key: string]: unknown;
}

// T extends Translation ensures the generic type has the required lang property
export const toNestedTranslations = <T extends Translation>(
  translations: T[]
): Record<TargetLang, T> => {
  if (translations.length === 0) {
    return Object.fromEntries(
      targetLanguageTags.map((lang) => [lang, {} as T])
    ) as Record<TargetLang, T>;
  }
  return translations.reduce(
    (acc: Record<TargetLang, T>, translation: T) => {
      acc[translation.lang] = translation;
      return acc;
    },
    {} as Record<TargetLang, T>
  );
};

export async function hierarchicalEntityQuery<
  usersT extends Table,
  translationsT extends Table
>(
  db: any,
  ref: string,
  publicIdentifier: string = 'id',
  accessStrategy: string = 'EntityOwn',
  selectTableRelations: NestedRelations,
  userId: string | undefined,
  userTable: usersT | undefined,
  translationTable: translationsT | boolean,
  depth: number = 1,
  hierarchy?: ResourceHierarchy
) {
  // NEW is a reserved keyword for new entities
  if (ref == NEW_REF) {
    throw new Error('The old shall never be new again');
  }
  const resourceHierarchy = hierarchy || Object.values(resourceConfig);
  const slicedHierarchy = resourceHierarchy.slice(-depth, resourceHierarchy.length);
  const conditions = [
    eq(getTable(slicedHierarchy, 0)[publicIdentifier], ref),
    ...applyAccessStrategy(db, accessStrategy, slicedHierarchy, userTable, userId)
  ];

  if (translationTable) {
    conditions.push(
      ...applyTranslationCondition(db, slicedHierarchy, translationTable)
    );
  }

  let result = await db.query[getTableName(getTable(slicedHierarchy, 0))].findFirst({
    where: and(...conditions),
    with: selectTableRelations
  });

  if (!result) {
    return error(401, "Doors have ears, but they haven't ever heard of this.");
  }

  result = processTranslations<Translation>(result, selectTableRelations);

  return result;
}

function processTranslations<T extends Translation>(
  data: Record<string, any>,
  relations: NestedRelations
): Record<string, any> {
  if (!data) return data;

  const result = { ...data };

  // Process current level translations if they exist
  if (relations.translations === true && Array.isArray(result.translations)) {
    result.translations = toNestedTranslations<T>(result.translations);
  }

  // Process nested relations
  for (const [key, value] of Object.entries(relations)) {
    if (value && typeof value === 'object' && 'with' in value) {
      if (Array.isArray(result[key])) {
        // Handle array of nested objects
        result[key] = result[key].map((item: Record<string, any>) =>
          processTranslations(item, value.with)
        );
      } else if (result[key] && typeof result[key] === 'object') {
        // Handle single nested object
        result[key] = processTranslations(result[key], value.with);
      }
    }
  }

  return result;
}

// Testing Functions

export const isFieldUnique = async <T extends Resource>(
  db: Database,
  data: T,
  resourceType: ResourceType = 'organisation',
  field: Field = 'code'
): Promise<boolean> => {
  // Check whether the organisation code already exists
  const table = resourceConfig[resourceType].table;
  const [existingEntity] = await db
    .select()
    .from(table)
    .where(eq(table[field], data[field]))
    .limit(1);
  return existingEntity ? false : true;
};

export const isFieldChanged = async <T extends ResourceDB>(
  db: Database,
  id: string,
  value: string,
  resourceType: ResourceType = 'organisation',
  field: Field = 'code'
): Promise<boolean> => {
  // Check whether the provided code is different from the one in the database
  const table = resourceConfig[resourceType].table;
  const [existingEntity]: T[] = await db
    .select()
    .from(table)
    .where(eq(table.id, id))
    .limit(1);

  if (!existingEntity) {
    return false; // Organisation not found
  }

  return existingEntity[field] !== value;
};

export async function updatePartial<T extends Table>(
  db: Database,
  table: T,
  ref: Ref,
  refKey: string,
  data: Partial<Record<string, unknown>>
) {
  let updated: T;
  if (Object.keys(data).length > 0) {
    [updated] = await db
      .update(table)
      .set(data)
      .where(eq(table[refKey], ref))
      .returning();
  } else {
    [updated] = (await db
      .select()
      .from(table)
      .where(eq(table[refKey], ref))
      .limit(1)) as T[];
  }

  if (!updated) {
    return error(404, `Entity <code>${ref}</code> not found`);
  }

  return updated;
}

// EXPORTS

export default client;

// Helper function to validate column names against a table
export function validateTableColumns(
  table: Table,
  columns: string[],
  exclude: string[] = []
): { valid: boolean; invalidColumns: string[] } {
  const tableColumns = Object.keys(table);
  const invalidColumns = columns.filter(
    (col) => !tableColumns.includes(col) && !exclude.includes(col)
  );
  return {
    valid: invalidColumns.length === 0,
    invalidColumns
  };
}
