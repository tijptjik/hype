import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@auth/d1-adapter';
import * as schema from './schema';
import {
  Table,
  getTableName,
  and,
  sql,
  inArray,
  eq,
  or,
  not,
  exists
} from 'drizzle-orm';

const client = (database: D1Database) => {
  return drizzle(database, { schema });
};

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

export async function genericIndexQuery<
  T extends Table,
  usersT extends Table,
  translationsT extends Table,
>(
  db: any,
  accessStrategy: string = 'listingOwn',
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
  const conditions = [];

  // CONTEXT : RESOURCE HIERARCHY
  const slicedHierarchy = resourceHierarchy.slice(-depth, resourceHierarchy.length);

  // UTILS : RESOURCE HIERARCHY
  const getTable = (index: number) => {
    return slicedHierarchy[index].table;
  };

  const getForeignKey = (index: number) => {
    return slicedHierarchy[index].keyToParent as string;
  };

  const getReverseForeignKey = (index: number) => {
    return slicedHierarchy[index].keyToSelf;
  };

  // CONDITIONS : ACCESS STRATEGY

  // CONDITIONS : ACCESS STRATEGY : SUPER ADMIN : Can access all
  // CONDITIONS : ACCESS STRATEGY : PUBLIC : Can access all
  // CONDITIONS : ACCESS STRATEGY : LISTING ALL : Can access all
  if (accessStrategy) {
    console.debug('RESOURCE', getTableName(getTable(0)));
    if (['superAdmin', 'public', 'listingAll'].includes(accessStrategy)) {
      true;
      // CONDITIONS : ACCESS STRATEGY : LISTING OWN : Can access own records
    } else if (accessStrategy === 'listingOwn') {
      conditions.push(
        inArray(
          getTable(0).id,
          db
            .select({ id: userTable[getReverseForeignKey(0)] })
            .from(userTable)
            .where(
              and(
                eq(userTable[getReverseForeignKey(0)], getTable(0).id),
                eq(userTable.userId, userId)
              )
            )
        )
      );

      // CONDITIONS : ACCESS STRATEGY : LISTING OWN CHILDREN : Can access records where they own the parents
    } else if (accessStrategy === 'listingOwnChildren') {
      conditions.push(
        inArray(
          getTable(0)[getForeignKey(0)],
          db
            .select({ id: getTable(1).id })
            .from(getTable(1))
            .innerJoin(userTable, eq(userTable[getReverseForeignKey(1)], getTable(1).id))
            .where(eq(userTable.userId, userId))
        )
      );

      // CONDITIONS : ACCESS STRATEGY : LISTING OWN GRANDCHILDREN : Can access records where they own the grandparents
    } else if (accessStrategy === 'listingOwnGrandChildren') {
      conditions.push(
        inArray(
          getTable(0)[getForeignKey(0)],
          db
            .select({ id: getTable(1).id })
            .from(getTable(1))
            .innerJoin(
              getTable(2),
              eq(getTable(1)[getForeignKey(1)], getTable(2).id)
            )
            .innerJoin(
              userTable,
              eq(userTable[getReverseForeignKey(2)], getTable(2).id)
            )
            .where(eq(userTable.userId, userId))
        )
      );
    } else if (['ProfileAll', 'ProfileOwn'].includes(accessStrategy)) {
      throw new Error('Invalid Generic Query - use genericProfileQuery instead');
    } else {
      throw new Error('Invalid access strategy');
    }
  }

  // CONDITIONS : TRANSLATIONS

  // Add the condition to check if the record is in the translation table
  if (translationTable) {
    conditions.push(
      inArray(
        getTable(0).id,
        db
          .select({ id: translationTable[getReverseForeignKey(0)] })
          .from(translationTable)
          .where(eq(translationTable[getReverseForeignKey(0)], getTable(0).id))
      )
    );
  }

  // CONDITIONS : FILTER CONSTRAINTS
  if (Object.values(prisms).some((arr) => arr.length > 0)) {
    let subQueries = [];
    let levelUp = 1;

    const getIds = (index: number) => {
      return prisms[slicedHierarchy[index].name] || [];
    };

    const createLevelQuery = (levelUp: number) => {
      const conditions = [];
      const baseQuery = db.select({ id: getTable(levelUp).id }).from(getTable(levelUp));

      if (levelUp > 0) {
        conditions.push(inArray(getTable(levelUp).id, getIds(levelUp)));
      }

      if (levelUp > 1) {
        conditions.push(
          not(
            exists(
              db
                .select({ id: getTable(levelUp - 1).id })
                .from(getTable(levelUp - 1))
                .where(
                  and(
                    eq(getTable(levelUp - 1)[getForeignKey(levelUp - 1)], getTable(levelUp).id),
                    inArray(getTable(levelUp - 1).id, getIds(levelUp - 1))
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
                .select({ id: sql<string>`${getTable(levelUp - 2).id}`.as('id') })
                .from(getTable(levelUp - 1))
                .innerJoin(
                  getTable(levelUp - 2),
                  eq(getTable(levelUp - 2)[getForeignKey(levelUp - 2)], getTable(levelUp - 1).id)
                )
                .where(
                  and(
                    eq(getTable(levelUp - 1)[getForeignKey(levelUp - 1)], getTable(levelUp).id),
                    inArray(getTable(levelUp - 2).id, getIds(levelUp - 2))
                  )
                )
            )
          )
        );
      }

      return baseQuery.where(and(...conditions));
    };

    while (levelUp < depth) {
      let baseLevelQuery = db.$with(`level_min_${levelUp}`);
      subQueries.push(baseLevelQuery.as(createLevelQuery(levelUp)));
      levelUp++;
    }

    let baseQuery = db.with(...subQueries);
    baseQuery = baseQuery.select({ id: getTable(0).id }).from(getTable(0));

    let subQueryConditions = [];

    for (let i = 1; i < depth; i++) {
      baseQuery = baseQuery.innerJoin(
        getTable(i),
        eq(
          getTable(i - 1)[getForeignKey(i - 1)],
          getTable(i).id
        )
      );
      subQueryConditions.push(sql`${getTable(i).id} IN (SELECT id FROM ${`level_min_${i}`})`.inlineParams());
    }

    conditions.push(inArray(getTable(0).id, baseQuery.where(or(...subQueryConditions))));
  }

  const query = db.query[getTableName(getTable(0))].findMany({
    where: and(...conditions),
    with: selectTableRelations
  });

  return await query;
}

export default client;