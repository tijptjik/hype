import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@auth/d1-adapter';
import * as schema from './schema';
import { Table, getTableName, and, sql, inArray, eq, or, not, exists } from 'drizzle-orm';
// TYPES
import type { NestedRelations } from '$lib/types';

const client = (database: D1Database) => {
  return drizzle(database, { schema });
};


// CONFIG
const resourceConfig = {
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
const getReverseForeignKey = (slicedHierarchy: typeof resourceHierarchy, index: number) =>
  slicedHierarchy[index].keyToSelf;

const applyAccessStrategy = (
  db: any,
  accessStrategy: string,
  slicedHierarchy: typeof resourceHierarchy,
  userTable: Table,
  userId: string
) => {
  if (['SuperAdmin', 'Public', 'ResourceAll', 'EntityAny'].includes(accessStrategy)) {
    return [];
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
            .where(and(eq(userTable[reverseFK0], table0.id), eq(userTable.userId, userId)))
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
    )];
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
      inArray(getTable(slicedHierarchy, levelUp).id, prisms[slicedHierarchy[levelUp].name] || [])
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
            .select({ id: sql<string>`${getTable(slicedHierarchy, levelUp - 2).id}`.as('id') })
            .from(getTable(slicedHierarchy, levelUp - 1))
            .innerJoin(
              getTable(slicedHierarchy, levelUp - 2),
              eq(
                getTable(slicedHierarchy, levelUp - 2)[getForeignKey(slicedHierarchy, levelUp - 2)],
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

  let subQueries = [];
  for (let levelUp = 1; levelUp < depth; levelUp++) {
    let baseLevelQuery = db.$with(`level_min_${levelUp}`);
    subQueries.push(baseLevelQuery.as(createLevelQuery(db, slicedHierarchy, levelUp, prisms)));
  }

  let baseQuery = db.with(...subQueries);
  baseQuery = baseQuery
    .select({ id: getTable(slicedHierarchy, 0).id })
    .from(getTable(slicedHierarchy, 0));

  let subQueryConditions = [];

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

  return [inArray(getTable(slicedHierarchy, 0).id, baseQuery.where(or(...subQueryConditions)))];
};

export async function genericIndexQuery<usersT extends Table, translationsT extends Table>(
  db: any,
  accessStrategy: string = 'ResourceOwn',
  selectTableRelations: Record<string, boolean>,
  userId: string,
  userTable: usersT,
  translationTable: translationsT | boolean,
  prisms: {
    organisation?: string[];
    project?: string[];
    layer?: string[];
  } = {},
  depth: number = 1
) {
  const slicedHierarchy = resourceHierarchy.slice(-depth, resourceHierarchy.length);

  const conditions = [
    ...applyAccessStrategy(db, accessStrategy, slicedHierarchy, userTable, userId),
    ...applyTranslationCondition(db, slicedHierarchy, translationTable),
    ...applyFilterConstraints(db, slicedHierarchy, depth, prisms)];

  return await db.query[getTableName(getTable(slicedHierarchy, 0))].findMany({
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

export async function genericEntityQuery<usersT extends Table, translationsT extends Table>(
  db: any,
  ref: string,
  publicIdentifier: string = 'id',
  accessStrategy: string = 'EntityOwn',
  selectTableRelations: NestedRelations,
  userId: string,
  userTable: usersT,
  translationTable: translationsT | boolean,
  depth: number = 1
) {
  // NEW is a reserved keyword for new entities
  if (ref == 'new') {
    throw new Error('The old shall never be new again');
  }
  const slicedHierarchy = resourceHierarchy.slice(-depth, resourceHierarchy.length);

  const conditions = [
    eq(getTable(slicedHierarchy, 0)[publicIdentifier], ref),
    ...applyAccessStrategy(db, accessStrategy, slicedHierarchy, userTable, userId)];

  if (translationTable) {
    conditions.push(...applyTranslationCondition(db, slicedHierarchy, translationTable));
  }

  const userJoinTables = findUserJoinTables(selectTableRelations);

  let result = await db.query[getTableName(getTable(slicedHierarchy, 0))].findFirst({
    where: and(...conditions),
    with: selectTableRelations
  });

  // Reduce translations to a single object with language as key
  if (translationTable) {
    result.translations = result.translations.reduce(
      (acc: Record<string, Record<string, any>>, translation: Record<string, any>) => {
        const { lang, ...translationWithoutLang } = translation;
        acc[lang] = translationWithoutLang;
        return acc;
      },
      {}
    );
  }
  console.log('USER JOIN TABLES', userJoinTables);
  if (userJoinTables) {
    for (const userJoinTable of userJoinTables) {
      result[userJoinTable] = result[userJoinTable].reduce(
        (acc: Record<string, Record<string, any>>, user: Record<string, any>) => {
          const { userId, ...userWithoutId } = user;
          acc[userId] = userWithoutId;
          return acc;
        },
        {}
      );
    }
  }

  return result;
}

export default client;
