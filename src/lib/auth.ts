// BETTER-AUTH
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, anonymous, username } from 'better-auth/plugins';
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
    // DATABASE HOOKS
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Generate username if not provided
            if (!(user as any).username) {
              const { generateUsernameFromId } = await import('$lib/utils/username');
              const username = generateUsernameFromId(user.id);
              return {
                data: {
                  ...user,
                  username,
                  displayUsername: username
                }
              };
            }
            return { data: user };
          }
        }
      }
    },
    // OAUTH
    socialProviders: {
      google: {
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET
      }
    },
    // PLUGINS
    plugins: [
      username({
        usernameValidator: async (username) => {
          if (username === 'admin') {
            return false;
          }

          // Check if username conflicts with existing usernames or user IDs
          const { user } = await import('$lib/db/schema/user');
          const { or, eq } = await import('drizzle-orm');

          const existingUser = await db
            .select()
            .from(user)
            .where(or(eq(user.username, username), eq(user.id, username)))
            .limit(1);

          return existingUser.length === 0;
        }
      }),
      anonymous({
        disableDeleteAnonymousUser: true,
        generateName: () => 'Anonymous',
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          // Mark the user as no longer anonymous when linking accounts
          const { user } = await import('$lib/db/schema/user');
          const { eq } = await import('drizzle-orm');

          await db
            .update(user)
            .set({ isAnonymous: false })
            .where(eq(user.id, anonymousUser.user.id));
        }
      }),

      customSession(async ({ user, session }) => {
        // Import these here to avoid circular dependencies
        const { getUserRoles } = await import('$lib/db/services/user');
        const { getUserLayers } = await import('./client/services/auth');

        // Get user roles and layers
        const roles: UserRoleDisco[] = await getUserRoles(db, user.id);
        const userLayers: UserLayer[] = await getUserLayers(db, user.id);
        const superAdmin = user.id === env.SUPERADMIN_USERID;

        // Parse JSON fields from strings to objects
        let preferences: UserPreferences;
        let experimental: UserExperimental;

        try {
          preferences = JSON.parse((user as any).preferences);
        } catch {
          preferences = {
            fallbackLocales: [],
            allowMachineTranslation: false,
            preferFallbackInCurrentLocale: false,
            isTranslateButtonVisible: true
          };
        }

        try {
          experimental = JSON.parse((user as any).experimental);
        } catch {
          experimental = {
            contributorMode: false,
            noLabelsMode: false
          };
        }

        // Return enriched session data
        return {
          user: {
            ...user,
            preferences,
            experimental,
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
