import { error } from '@sveltejs/kit';
// DB
import { eq, and } from 'drizzle-orm';
import { task, taskImage, image, featureImage } from '$lib/db/schema';
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

export const archiveImages = async (
  db: Database,
  taskId: string,
  isUndefinedOnly: boolean = false
) => {
  try {
    // Get all task images for this task
    const taskImages = await db
      .select({
        imageId: taskImage.imageId,
        intent: featureImage.intent
      })
      .from(taskImage)
      .leftJoin(featureImage, eq(taskImage.imageId, featureImage.imageId))
      .where(eq(taskImage.taskId, taskId));

    // Filter images based on isUndefinedOnly parameter
    const imagesToProcess = isUndefinedOnly
      ? taskImages.filter((ti) => ti.intent === 'undefined')
      : taskImages;

    // Process each image
    for (const ti of imagesToProcess) {
      // Delete feature image association
      await db.delete(featureImage).where(eq(featureImage.imageId, ti.imageId));

      // Update image record
      await db.update(image).set({ isArchived: true }).where(eq(image.id, ti.imageId));
    }

    return { success: true, processedCount: imagesToProcess.length };
  } catch (error) {
    console.error('Failed to archive images:', error);
    throw error;
  }
};

export const publishImages = async (
  db: Database,
  taskId: string,
  skipUndefined: boolean = false
) => {
  try {
    // Get all task images for this task
    const taskImages = await db
      .select({
        imageId: taskImage.imageId,
        intent: featureImage.intent,
        featureId: task.featureId
      })
      .from(taskImage)
      .leftJoin(featureImage, eq(taskImage.imageId, featureImage.imageId))
      .leftJoin(task, eq(taskImage.taskId, task.id))
      .where(eq(taskImage.taskId, taskId));

    // Filter images based on skipUndefined parameter
    const imagesToProcess = skipUndefined
      ? taskImages.filter((ti) => ti.intent !== 'undefined')
      : taskImages;

    // Process each image
    for (const ti of imagesToProcess) {
      if (!ti.featureId) {
        console.warn(`Skipping image ${ti.imageId} - no featureId found`);
        continue;
      }

      // Update or create feature image association
      await db
        .insert(featureImage)
        .values({
          imageId: ti.imageId,
          featureId: ti.featureId,
          intent: 'undefined',
          isPublished: true
        })
        .onConflictDoUpdate({
          target: [featureImage.imageId, featureImage.featureId],
          set: { isPublished: true }
        });
    }

    return { success: true, processedCount: imagesToProcess.length };
  } catch (error) {
    console.error('Failed to publish images:', error);
    throw error;
  }
};
