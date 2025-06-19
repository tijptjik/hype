// BETTER-AUTH
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession } from 'better-auth/plugins';
// CONFIG
import { authConfig } from './auth/config';
// DB SCHEMA
import * as schema from '$lib/db/schema/index';
// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  UserRoleDisco,
  UserLayer,
  UserPreferences,
  UserExperimental,
  Locale
} from '$lib/types';

// Create auth instance with the D1 database and environment variables
export const createAuth = (
  db: DrizzleD1Database<typeof schema>,
  env: {
    AUTH_SECRET: string;
    AUTH_GOOGLE_ID: string;
    AUTH_GOOGLE_SECRET: string;
    SUPERADMIN_USERID: string;
  }
) => {
  return betterAuth({
    // COMMON CONFIG
    ...authConfig,
    // ENV
    secret: env.AUTH_SECRET,
    // DB
    database: drizzleAdapter(db, {
      provider: 'sqlite'
    }),
    // OAUTH
    socialProviders: {
      google: {
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET
      }
    },
    // PLUGINS
    plugins: [
      customSession(async ({ user, session }) => {
        // Import these here to avoid circular dependencies
        const { getUserRoles } = await import('$lib/db/services/user');
        const { getUserLayers } = await import('./client/services/auth');

        // Get user roles and layers
        const roles: UserRoleDisco[] = await getUserRoles(db, user.id);
        const userLayers: UserLayer[] = await getUserLayers(db, user.id);
        const superAdmin = user.id === env.SUPERADMIN_USERID;

        // Return enriched session data
        return {
          user: {
            ...user,
            roles,
            userLayers,
            superAdmin
          },
          session
        };
      })
    ]
  });
};

// Export types using Better Auth's inference
export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth['$Infer']['Session'];
export type SessionUser = Session['user'] & {
  locale: Locale;
  attribution: string;
  isArchived: boolean;
  preferences: UserPreferences;
  experimental: UserExperimental;
  superAdmin: boolean;
  roles: UserRoleDisco[];
  userLayers: UserLayer[];
};
export type SessionSession = Session['session'];
