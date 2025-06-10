// SVELTEKIT
import { error } from '@sveltejs/kit';
import { getTableName, and, inArray, eq, getTableColumns, sql } from 'drizzle-orm';
// TYPES
import type { Database, DbTable, Id } from '../types';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel, InferInsertModel, SQL } from 'drizzle-orm';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 2. CRUD :: CREATE
//    - insert
//    - insertMany
//
// 6. CRUD :: READ
//    - read
//    - readMany
//
// 3. CRUD :: UPDATE
//    - update
//    - updateMany
//
// 4. CRUD :: UPSERT
//    - upsert
//    - upsertMany
//    - conflictUpdateAllExcept
//
// 5. CRUD :: DELETE
//    - del
//    - delMany
//
// 7. RELATIONAL :: CREATE
//    - insertRelated
//    - insertManyRelated
//
// 10. RELATIONAL :: READ
//     - readRelated
//     - readManyRelated
//
// 8. RELATIONAL :: UPDATE
//    - updateRelated
//    - updateManyRelated
//    - replaceManyRelated
//
// 9. RELATIONAL :: DELETE
//    - delRelated
//    - delManyRelated
//

// ═══════════════════════
// 2. CRUD :: CREATE
// ═══════════════════════

/**
 * Inserts a new record into the specified table
 * @param db Database instance
 * @param table Table to insert into
 * @param data Data to insert (single record)
 * @returns The inserted record
 */
export const insert = async <T extends DbTable>(
  db: Database,
  table: T,
  data: InferInsertModel<T>
): Promise<InferSelectModel<T>> => {
  if (Array.isArray(data)) {
    return error(400, 'Single record insert expected, array provided');
  }
  const [insertedEntity] = await db.insert(table).values(data).returning();

  if (!insertedEntity) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} has stepped through the looking glass`
    );
  }

  return insertedEntity as InferSelectModel<T>;
};

/**
 * Inserts multiple records into the specified table
 * @param db Database instance
 * @param table Table to insert into
 * @param data Array of data to insert
 * @returns Array of inserted records
 */
export const insertMany = async <T extends DbTable>(
  db: Database,
  table: T,
  data: InferInsertModel<T>[]
): Promise<InferSelectModel<T>[]> => {
  if (!Array.isArray(data)) {
    return error(400, 'Array of records expected for batch insert');
  }

  const insertedEntities = await db.insert(table).values(data).returning();

  if (!insertedEntities.length) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} has stepped through the looking glass`
    );
  }

  return insertedEntities as InferSelectModel<T>[];
};

// ═══════════════════════
// 3. CRUD :: UPDATE
// ═══════════════════════

/**
 * Updates a single record in the specified table matching the where clause
 * @param db Database instance
 * @param table Table to update
 * @param data Data to update (single record)
 * @param whereColumn Column to match
 * @param whereValue Value to match
 * @returns The updated record
 */
export const update = async <T extends DbTable>(
  db: Database,
  table: T,
  data: Partial<InferInsertModel<T>>,
  whereColumn: SQLiteColumn<any>,
  whereValue: Id
): Promise<InferSelectModel<T>> => {
  if (Array.isArray(data)) {
    return error(400, 'Single record update expected, array provided');
  }

  const [updatedEntity] = await db
    .update(table)
    .set(data)
    .where(eq(whereColumn, whereValue))
    .returning();

  if (!updatedEntity) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} <code>${whereValue}</code> has stepped through the looking glass`
    );
  }

  return updatedEntity as InferSelectModel<T>;
};

/**
 * Updates multiple records in the specified table matching the where clause
 * @param db Database instance
 * @param table Table to update
 * @param data Array of data to update
 * @param whereColumn Column to match
 * @param whereValues Array of values to match
 * @returns Array of updated records
 */
export const updateMany = async <T extends DbTable>(
  db: Database,
  table: T,
  data: Partial<InferInsertModel<T>>[],
  whereColumn: SQLiteColumn<any>,
  whereValues: Id[]
): Promise<InferSelectModel<T>[]> => {
  if (!Array.isArray(data)) {
    return error(400, 'Array of records expected for batch update');
  }

  const updatedEntities = await db
    .update(table)
    .set(data)
    .where(inArray(whereColumn, whereValues))
    .returning();

  if (!updatedEntities.length) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} <code>${whereValues.join(', ')}</code> has stepped through the looking glass`
    );
  }

  return updatedEntities as InferSelectModel<T>[];
};

// ═══════════════════════
// 4. CRUD :: UPSERT
// ═══════════════════════

export function conflictUpdateAllExcept<
  T extends SQLiteTable,
  E extends (keyof T['$inferInsert'])[]
>(table: T, except: E) {
  const columns = getTableColumns(table);
  const updateColumns = Object.entries(columns).filter(
    ([col]) => !except.includes(col as keyof typeof table.$inferInsert)
  );

  return updateColumns.reduce(
    (acc, [colName, table]) => ({
      ...acc,
      [colName]: sql.raw(`excluded.${table.name}`)
    }),
    {}
  ) as Omit<Record<keyof typeof table.$inferInsert, SQL>, E[number]>;
}

/**
 * Upserts a single record into the specified table
 * @param db Database instance
 * @param table Table to upsert into
 * @param data Data to upsert (single record)
 * @param conflictColumns Columns to check for conflicts
 * @returns The upserted record
 */
export const upsert = async <T extends DbTable>(
  db: Database,
  table: T,
  data: InferInsertModel<T>,
  conflictColumns: SQLiteColumn<any>[],
  conflictUpdateAllExceptColumns: (keyof T['$inferInsert'])[] | [] = []
): Promise<InferSelectModel<T>> => {
  if (Array.isArray(data)) {
    return error(400, 'Single record upsert expected, array provided');
  }

  const [upsertedEntity] = await db
    .insert(table)
    .values(data)
    .onConflictDoUpdate({
      target: conflictColumns as any,
      set: conflictUpdateAllExcept(table, conflictUpdateAllExceptColumns) as any
    })
    .returning();

  if (!upsertedEntity) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} has stepped through the looking glass`
    );
  }

  return upsertedEntity as InferSelectModel<T>;
};

/**
 * Upserts multiple records into the specified table
 * @param db Database instance
 * @param table Table to upsert into
 * @param data Array of data to upsert
 * @param conflictColumns Columns to check for conflicts
 * @returns Array of upserted records
 */
export const upsertMany = async <T extends DbTable>(
  db: Database,
  table: T,
  data: InferInsertModel<T>[],
  conflictColumns: (keyof InferInsertModel<T>)[]
): Promise<InferSelectModel<T>[]> => {
  if (!Array.isArray(data)) {
    return error(400, 'Array of records expected for batch upsert');
  }

  const upsertedEntities = await db
    .insert(table)
    .values(data)
    .onConflictDoUpdate({
      target: conflictColumns as any,
      set: data
    })
    .returning();

  if (!upsertedEntities.length) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} has stepped through the looking glass`
    );
  }

  return upsertedEntities as InferSelectModel<T>[];
};

// ═══════════════════════
// 5. CRUD :: DELETE
// ═══════════════════════

/**
 * Deletes a single record from the specified table matching the where clause
 * @param db Database instance
 * @param table Table to delete from
 * @param whereColumn Column to match
 * @param whereValue Value to match
 * @returns The deleted record
 */
export const del = async <T extends DbTable>(
  db: Database,
  table: T,
  whereColumn: SQLiteColumn<any>,
  whereValue: Id
): Promise<InferSelectModel<T>> => {
  const [deletedEntity] = await db
    .delete(table)
    .where(eq(whereColumn, whereValue))
    .returning();

  if (!deletedEntity) {
    return error(404, `${getTableName(table).toUpperCase()} not found`);
  }

  return deletedEntity as InferSelectModel<T>;
};

/**
 * Deletes multiple records from the specified table matching the where clause
 * @param db Database instance
 * @param table Table to delete from
 * @param whereColumn Column to match
 * @param whereValues Array of values to match
 * @returns Array of deleted records
 */
export const delMany = async <T extends DbTable>(
  db: Database,
  table: T,
  whereColumn: SQLiteColumn<any>,
  whereValues: Id[]
): Promise<InferSelectModel<T>[]> => {
  const deletedEntities = await db
    .delete(table)
    .where(inArray(whereColumn, whereValues))
    .returning();

  if (!deletedEntities.length) {
    return error(404, `${getTableName(table).toUpperCase()} not found`);
  }

  return deletedEntities as InferSelectModel<T>[];
};

// ═══════════════════════
// 6. CRUD :: READ
// ═══════════════════════

/**
 * Reads a single record from the specified table matching the where clause
 * @param db Database instance
 * @param table Table to read from
 * @param whereColumn Column to match
 * @param whereValue Value to match
 * @returns The matching record
 */
export const read = async <T extends DbTable>(
  db: Database,
  table: T,
  whereColumn: SQLiteColumn<any>,
  whereValue: Id
): Promise<InferSelectModel<T>> => {
  const [entity] = await db
    .select()
    .from(table)
    .where(eq(whereColumn, whereValue))
    .limit(1);

  if (!entity) {
    return error(404, `${getTableName(table).toUpperCase()} not found`);
  }

  return entity as InferSelectModel<T>;
};

/**
 * Reads multiple records from the specified table matching the where clause
 * @param db Database instance
 * @param table Table to read from
 * @param whereColumn Column to match
 * @param whereValues Array of values to match
 * @returns Array of matching records
 */
export const readMany = async <T extends DbTable>(
  db: Database,
  table: T,
  whereColumn: SQLiteColumn<any>,
  whereValues: Id[]
): Promise<InferSelectModel<T>[]> => {
  const entities = await db
    .select()
    .from(table)
    .where(inArray(whereColumn, whereValues));

  if (!entities.length) {
    return error(404, `${getTableName(table).toUpperCase()} not found`);
  }

  return entities as InferSelectModel<T>[];
};

// ═══════════════════════
// 7. RELATIONAL :: CREATE
// ═══════════════════════

/**
 * Inserts a related record into the specified table with a foreign key reference
 * @param db Database instance
 * @param table Table to insert into
 * @param data Data to insert (single record)
 * @param foreignKeyColumn Foreign key column to set
 * @param foreignKeyValue Foreign key value to set
 * @returns The inserted record
 */
export const insertRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  data: InferInsertModel<T>,
  foreignKeyColumn: keyof InferInsertModel<T>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>> => {
  if (Array.isArray(data)) {
    return error(400, 'Single record insert expected, array provided');
  }

  const [insertedEntity] = await db
    .insert(table)
    .values({
      ...data,
      [foreignKeyColumn as string]: foreignKeyValue
    })
    .returning();

  if (!insertedEntity) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} has stepped through the looking glass`
    );
  }

  return insertedEntity as InferSelectModel<T>;
};

/**
 * Inserts multiple related records into the specified table with a foreign key reference
 * @param db Database instance
 * @param table Table to insert into
 * @param data Array of data to insert
 * @param foreignKeyColumn Foreign key column to set
 * @param foreignKeyValue Foreign key value to set
 * @returns Array of inserted records
 */
export const insertManyRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  data: InferInsertModel<T>[],
  foreignKeyColumn: keyof InferInsertModel<T>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>[]> => {
  if (!Array.isArray(data)) {
    return error(400, 'Array of records expected for batch insert');
  }

  const values = data.map((item) => ({
    ...item,
    [foreignKeyColumn as string]: foreignKeyValue
  }));

  const insertedEntities = await db.insert(table).values(values).returning();

  if (!insertedEntities.length) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} has stepped through the looking glass`
    );
  }

  return insertedEntities as InferSelectModel<T>[];
};

// ═══════════════════════
// 8. RELATIONAL :: UPDATE
// ═══════════════════════

/**
 * Updates a related record in the specified table matching both the where clause and foreign key
 * @param db Database instance
 * @param table Table to update
 * @param data Data to update (single record)
 * @param whereColumn Column to match
 * @param whereValue Value to match
 * @param foreignKeyColumn Foreign key column to check
 * @param foreignKeyValue Foreign key value to check
 * @returns The updated record
 */
export const updateRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  data: Partial<InferInsertModel<T>>,
  whereColumn: SQLiteColumn<any>,
  whereValue: Id,
  foreignKeyColumn: SQLiteColumn<any>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>> => {
  if (Array.isArray(data)) {
    return error(400, 'Single record update expected, array provided');
  }

  const [updatedEntity] = await db
    .update(table)
    .set(data)
    .where(and(eq(whereColumn, whereValue), eq(foreignKeyColumn, foreignKeyValue)))
    .returning();

  if (!updatedEntity) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} <code>${whereValue}</code> has stepped through the looking glass`
    );
  }

  return updatedEntity as InferSelectModel<T>;
};

/**
 * Updates multiple related records in the specified table matching both the where clause and foreign key
 * @param db Database instance
 * @param table Table to update
 * @param data Array of data to update
 * @param whereColumn Column to match
 * @param whereValues Array of values to match
 * @param foreignKeyColumn Foreign key column to check
 * @param foreignKeyValue Foreign key value to check
 * @returns Array of updated records
 */
export const updateManyRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  data: Partial<InferInsertModel<T>>[],
  whereColumn: SQLiteColumn<any>,
  whereValues: Id[],
  foreignKeyColumn: SQLiteColumn<any>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>[]> => {
  if (!Array.isArray(data)) {
    return error(400, 'Array of records expected for batch update');
  }

  const updatedEntities = await db
    .update(table)
    .set(data)
    .where(
      and(inArray(whereColumn, whereValues), eq(foreignKeyColumn, foreignKeyValue))
    )
    .returning();

  if (!updatedEntities.length) {
    return error(
      404,
      `${getTableName(table).toUpperCase()} <code>${whereValues.join(', ')}</code> has stepped through the looking glass`
    );
  }

  return updatedEntities as InferSelectModel<T>[];
};

/**
 * Deletes existing related records and inserts new ones in the specified table matching both the where clause and foreign key
 * @param db Database instance
 * @param table Table to update
 * @param data Array of data to update
 * @param foreignKeyColumn Foreign key column to check
 * @param foreignKeyValue Foreign key value to check
 * @returns Array of updated records
 */
export const replaceManyRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  data: InferInsertModel<T>[],
  foreignKeyColumn: SQLiteColumn<any>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>[]> => {
  // First delete all existing records matching the foreign key
  await delManyRelated(db, table, foreignKeyColumn, foreignKeyValue);

  // Then insert all new records using the column name
  const columnName = foreignKeyColumn.name as keyof InferInsertModel<T>;
  return await insertManyRelated(db, table, data, columnName, foreignKeyValue);
};

// ═══════════════════════
// 9. RELATIONAL :: DELETE
// ═══════════════════════

/**
 * Deletes a related record from the specified table matching both the where clause and foreign key
 * @param db Database instance
 * @param table Table to delete from
 * @param whereColumn Column to match
 * @param whereValue Value to match
 * @param foreignKeyColumn Foreign key column to check
 * @param foreignKeyValue Foreign key value to check
 * @returns The deleted record
 */
export const delRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  whereColumn: SQLiteColumn<any>,
  whereValue: Id,
  foreignKeyColumn: SQLiteColumn<any>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>> => {
  const [deletedEntity] = await db
    .delete(table)
    .where(and(eq(whereColumn, whereValue), eq(foreignKeyColumn, foreignKeyValue)))
    .returning();

  if (!deletedEntity) {
    return error(404, `${getTableName(table).toUpperCase()} not found`);
  }

  return deletedEntity as InferSelectModel<T>;
};

/**
 * Deletes multiple related records from the specified table matching both the where clause and foreign key
 * @param db Database instance
 * @param table Table to delete from
 * @param foreignKeyColumn Foreign key column to check
 * @param foreignKeyValue Foreign key value to check
 * @param whereColumn Optional column to match
 * @param whereValues Optional array of values to match
 * @returns Array of deleted records
 */
export const delManyRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  foreignKeyColumn: SQLiteColumn<any>,
  foreignKeyValue: Id,
  whereColumn?: SQLiteColumn<any>,
  whereValues?: Id[]
): Promise<InferSelectModel<T>[]> => {
  const conditions = [eq(foreignKeyColumn, foreignKeyValue)];

  if (whereColumn && whereValues) {
    conditions.push(inArray(whereColumn, whereValues));
  }

  const deletedEntities = await db
    .delete(table)
    .where(and(...conditions))
    .returning();

  // Allow deleting zero records without erroring
  // if (!deletedEntities.length) {
  //   return error(404, `${getTableName(table).toUpperCase()} not found`);
  // }

  return deletedEntities as InferSelectModel<T>[];
};

// ═══════════════════════
// 10. RELATIONAL :: READ
// ═══════════════════════

/**
 * Reads a related record from the specified table matching both the where clause and foreign key
 * @param db Database instance
 * @param table Table to read from
 * @param whereColumn Column to match
 * @param whereValue Value to match
 * @param foreignKeyColumn Foreign key column to check
 * @param foreignKeyValue Foreign key value to check
 * @returns The matching record
 */
export const readRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  whereColumn: SQLiteColumn<any>,
  whereValue: Id,
  foreignKeyColumn: SQLiteColumn<any>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>> => {
  const [entity] = await db
    .select()
    .from(table)
    .where(and(eq(whereColumn, whereValue), eq(foreignKeyColumn, foreignKeyValue)))
    .limit(1);

  if (!entity) {
    return error(404, `${getTableName(table).toUpperCase()} not found`);
  }

  return entity as InferSelectModel<T>;
};

/**
 * Reads multiple related records from the specified table matching both the where clause and foreign key
 * @param db Database instance
 * @param table Table to read from
 * @param whereColumn Column to match
 * @param whereValues Array of values to match
 * @param foreignKeyColumn Foreign key column to check
 * @param foreignKeyValue Foreign key value to check
 * @returns Array of matching records
 */
export const readManyRelated = async <T extends DbTable>(
  db: Database,
  table: T,
  whereColumn: SQLiteColumn<any>,
  whereValues: Id[],
  foreignKeyColumn: SQLiteColumn<any>,
  foreignKeyValue: Id
): Promise<InferSelectModel<T>[]> => {
  const entities = await db
    .select()
    .from(table)
    .where(
      and(inArray(whereColumn, whereValues), eq(foreignKeyColumn, foreignKeyValue))
    );

  if (!entities.length) {
    return error(404, `${getTableName(table).toUpperCase()} not found`);
  }

  return entities as InferSelectModel<T>[];
};
