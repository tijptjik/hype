import { DrizzleAdapter } from '@auth/drizzle-adapter';
import GoogleProvider from '@auth/sveltekit/providers/google';
import {
  PRIVATE_AUTH_GOOGLE_ID,
  PRIVATE_AUTH_GOOGLE_SECRET,
  PRIVATE_AUTH_SECRET
} from '$env/static/private';
import client from '$lib/db';
import { account, session, user } from '$lib/db/schema';
import { SvelteKitAuth } from '@auth/sveltekit';
import { getUserRoles, getUserLayers } from './utils';
// TYPES
import type { UserRole } from './utils';
import type { User as SchemaUser, UserLayer } from '$lib/types';
import type { DefaultSession, Session } from '@auth/sveltekit';
import type { Handle } from '@sveltejs/kit';

declare module '@auth/sveltekit' {
  interface Session {
    user: {
      roles?: UserRole[];
      userLayers?: UserLayer[];
      superAdmin?: boolean;
      /**
       * By default, TypeScript merges new interface properties and overwrites existing ones.
       * In this case, the default session user properties will be overwritten,
       * with the new ones defined above. To keep the default session user properties,
       * you need to add them back into the newly declared interface.
       */
    } & DefaultSession['user'] &
      SchemaUser;
  }
}

// Auth configuration
export const { handle, signIn, signOut } = SvelteKitAuth(async (event) => {
  return {
    providers: [
      GoogleProvider({
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
    useSecureCookies: true,
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
        return session;
      }
    }
  };
});
