import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { user, userLayer } from '../schema';
import { UserUpdateAPI } from '../zod';

// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { Id, UserDB, UserLayer, UserUpdate } from '$lib/types';
import { updatePartial } from '..';

export type Database = DrizzleD1Database<
  typeof import('/home/io/code/ghostsigns/src/lib/db/schema')
>;

// UPDATE
export const updateUser = async (db: Database, data: UserDB, userId: Id) => {
  const [updatedUser] = await db
    .update(user)
    .set({ ...data })
    .where(eq(user.id, userId))
    .returning();

  if (!updatedUser) {
    error(404, 'User has stepped through the looking glass');
  }

  return updatedUser;
};

// USER LAYER PREFERENCES
export const updateUserLayers = async (
  db: Database,
  userLayers: { userId: Id; layerId: Id; isVisibleOnLoad: boolean }[],
  userId: Id
) => {
  // Delete existing layer preferences
  await db.delete(userLayer).where(eq(userLayer.userId, userId));

  // If no new preferences, we're done
  if (!userLayers?.length) {
    return [];
  }

  // Insert new layer preferences
  return await db.insert(userLayer).values(userLayers).returning();
};

// PATCH HANDLER
export const patchUser = async (
  db: Database,
  ref: string,
  data: UserUpdate,
  refType: 'id' | 'email'
) => {
  // Extract userLayers from data
  const { userLayers, ...userUpdate } = data;

  let updatedUser = await updatePartial(db, user, ref, refType, userUpdate);

  // Update layer preferences if provided
  if (userLayers) {
    updatedUser['userLayers'] = await updateUserLayers(db, userLayers, updatedUser.id);
  }

  return updatedUser;
};
