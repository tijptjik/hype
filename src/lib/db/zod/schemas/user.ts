// ZOD
import { z } from 'zod';
// DRIZZLE
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod';
// DRIZZLE SCHEMA
import { user } from '$lib/db/schema';
// CONSTRAINTS
// import { FeatureBase } from './feature';

/* ----------------- */
// USER SCHEMAS
/* -------- */

export const UserBase = createSelectSchema(user);
export const UserBasic = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true
} as const);
export const UserCurrent = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true,
  locale: true,
  preferences: true,
  experimental: true
} as const);
export const UserUpdate = createUpdateSchema(user);