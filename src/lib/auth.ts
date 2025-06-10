// RUNTIME AUTH CONFIGURATION
// This file is used by the application during runtime
// It uses the actual database connection from Cloudflare D1

// BETTER-AUTH
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession } from 'better-auth/plugins';
// Note: We'll get these from the platform.env instead of $env/static/private
// because $env/static/private doesn't work reliably in Cloudflare Workers
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
    PRIVATE_AUTH_SECRET: string;
    PRIVATE_AUTH_GOOGLE_ID: string;
    PRIVATE_AUTH_GOOGLE_SECRET: string;
    PRIVATE_SUPERADMIN_USERID: string;
  }
) => {
  return betterAuth({
    // COMMON CONFIG
    ...authConfig,
    // ENV
    secret: env.PRIVATE_AUTH_SECRET,
    // DB
    database: drizzleAdapter(db, {
      provider: 'sqlite'
    }),
    // OAUTH
    socialProviders: {
      google: {
        clientId: env.PRIVATE_AUTH_GOOGLE_ID,
        clientSecret: env.PRIVATE_AUTH_GOOGLE_SECRET
      }
    },
    // PLUGINS
    plugins: [
      customSession(async ({ user, session }) => {
        // Import these here to avoid circular dependencies
        const { getUserRoles } = await import('$lib/db/services/user');
        const { getUserLayers } = await import('./auth/utils');

        // Get user roles and layers
        const roles: UserRoleDisco[] = await getUserRoles(db, user.id);
        const userLayers: UserLayer[] = await getUserLayers(db, user.id);
        const superAdmin = user.id === env.PRIVATE_SUPERADMIN_USERID;

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
