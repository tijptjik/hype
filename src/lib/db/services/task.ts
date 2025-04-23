import { error } from '@sveltejs/kit';
// DB
import { eq } from 'drizzle-orm';
import { task } from '$lib/db/schema';
import * as schema from '$lib/db/schema';
import { resourceConfig, updatePartial } from '$lib/db';
import type { ResourceHierarchy } from '$lib/db';
// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { NewTaskDB, TaskDB } from '$lib/types';

export type Database = DrizzleD1Database<
  typeof import('/home/io/code/ghostsigns/src/lib/db/schema')
>;

export const createTask = async (db: Database, data: NewTaskDB) => {
  const [insertedTask] = await db
    .insert(task)
    .values({ ...data })
    .returning();

  if (!insertedTask) {
    return error(404, 'Task stepped through the portal and .. never .. came back');
  }

  return insertedTask;
};

export const updateTask = async (db: Database, data: TaskDB, id: string) => {
  const [updatedTask] = await db
    .update(task)
    .set({ ...data })
    .where(eq(task.id, id))
    .returning();

  if (!updatedTask) {
    return error(404, `Task <code>${id}</code> is one with the void`);
  }

  return updatedTask;
};

export const patchTask = async (db: Database, id: string, data: Partial<TaskDB>) => {
  return await updatePartial(db, task, id, 'id', data);
};

export const customHierarchy: ResourceHierarchy = [
  {
    name: 'task',
    table: schema.task,
    parentName: 'project',
    parentTable: schema.project,
    keyToParent: 'projectId',
    keyToSelf: 'taskId',
    depth: 2
  },
  resourceConfig.project,
  resourceConfig.organisation
];
