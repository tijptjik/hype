// ENV
import { PRIVATE_AUTH_GOOGLE_ID } from '$env/static/private';
// TYPES
import type { LayoutServerLoad } from './$types';
import type { Session } from '../lib/types';

export const load: LayoutServerLoad = async (event) => {
  return {
    session: await event.locals.auth() as Session,
    authProviders: {
      google: {
        clientId: PRIVATE_AUTH_GOOGLE_ID
      }
    }
  };
};
