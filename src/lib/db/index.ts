import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@auth/d1-adapter';
import * as schema from './schema';
import { Table, Relation, getTableName, and, sql, inArray, eq } from 'drizzle-orm';

const client = (database: D1Database) => {
  return drizzle(database, { schema });
};

export async function genericIndexQuery<
  T extends Table,
  usersT extends Table,
  translationsT extends Table,    
  RelationsT extends Record<string, Relation>
>(
  db: any,
  selectTable: T,
  selectTableRelations: Record<string, boolean>,
  userTable: usersT,
  translationTable: translationsT,
  remoteIdColumn: string,
  userId: string,
  accessStrategy: string
) {
  return await db.query[getTableName(selectTable)].findMany({
    where: and(
      accessStrategy === 'superAdmin'
        ? sql`true`
        : inArray(
            selectTable.id,
            db
              .select({ id: userTable[remoteIdColumn] })
              .from(userTable)
              .where(
                and(
                  eq(userTable[remoteIdColumn], selectTable.id),
                  eq(userTable.userId, userId)
                )
              )
          ),
      inArray(
        selectTable.id,
        db
          .select({ id: translationTable[remoteIdColumn] })
          .from(translationTable)
          .where(eq(translationTable[remoteIdColumn], selectTable.id))
      )
    ),
    with: selectTableRelations
  });
}

export default client;
