// DRIZZLE
import { DrizzleAdapter } from '@auth/drizzle-adapter';
// AUTH
import Google from '@auth/core/providers/google';
import { SvelteKitAuth } from '@auth/sveltekit';
// ENV
import {
  PRIVATE_AUTH_GOOGLE_ID,
  PRIVATE_AUTH_GOOGLE_SECRET,
  PRIVATE_AUTH_SECRET
} from '$env/static/private';
// DB
import client from '$lib/db';
import { account, session, user } from '$lib/db/schema';
import { getUserLayers } from './utils';
// DB
import { getUserRoles } from '$lib/db/services/user';
// TYPES
import type { Session } from '$lib/types';

// Auth configuration
export const { handle, signIn, signOut } = SvelteKitAuth(async (event) => {
  return {
    providers: [
      Google({
        clientId: PRIVATE_AUTH_GOOGLE_ID,
        clientSecret: PRIVATE_AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
        authorization: {
          params: {
            prompt: 'consent',
            access_type: 'offline',
            response_type: 'code'
          }
        }
      })
    ],
    secret: PRIVATE_AUTH_SECRET,
    trustHost: true,
    adapter: DrizzleAdapter(client(event.platform?.env.DB), {
      usersTable: user,
      accountsTable: account,
      sessionsTable: session
    }),
    useSecureCookies: false,
    session: {
      strategy: 'database',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      updateAge: 24 * 60 * 60 // update session age every 24 hours
    },
    debug: false,
    callbacks: {
      async session({ session, user }): Promise<Session> {
        const db = client(event.platform?.env.DB);
        session.user.roles = await getUserRoles(db, user.id);
        session.user.userLayers = await getUserLayers(db, user.id);
        // TODO : Replace this with a proper superadmin check once we have added it to the DB schema
        session.user.superAdmin = user.id === 'p6WnJ-DKl0c1';
        return session;
      }
    }
  };
});
