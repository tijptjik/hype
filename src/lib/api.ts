import { error, json } from '@sveltejs/kit';
import { getUserRoles, type UserRole } from '$lib/auth/utils';
import client from '$lib/db';

export const getSessionOrError = async (locals: App.Locals) => {
  const session = await locals.auth();
  if (!session?.user) {
    return error(401, 'No nice, no rice');
  }
  return session;
};

export const JSONResponseOrError = async (result: any): Promise<any> => {
  if (!result) {
    return error(404, "These aren't the signs you're looking for");
  }
  return json(result);
};

const checkAccessOrError = (
  userRoles: UserRole[],
  accessStrategy:
    | 'public'
    | 'superAdmin'
    | 'listingAll'
    | 'listingOwn'
    | 'ProfileAll'
    | 'ProfileOwn',
  resourceType: string = 'EVERYTHING'
) => {
  let hasAccess = false;

  if (['public', 'superAdmin', 'listingAll', 'profileAll'].includes(accessStrategy)) {
    hasAccess = true;
  } else if (['listingOwn', 'profileOwn'].includes(accessStrategy)) {
    hasAccess = userRoles.some((role) => role.type === resourceType);
  }

  if (!hasAccess) {
    return error(401, `All out of ${resourceType}`);
  }

  return hasAccess;
};

export const getDatabaseOrError = async (
  locals: App.Locals,
  platform: App.Platform | undefined,
  accessStrategy:
    | 'public'
    | 'superAdmin'
    | 'listingAll'
    | 'listingOwn'
    | 'ProfileAll'
    | 'ProfileOwn',
  resourceType?: string
) => {
  // Checks whether the user is logged in
  const session = await getSessionOrError(locals);
  // Connects to the database
  const db = client(platform?.env.DB);

  // Gets the user's roles
  const userRoles = await getUserRoles(db, session.user.id);

  // TODO Add SuperAdmin to User Table
  if (session.user.superAdmin === true) {
    // if (session.user.email === 'm@type.hk') {
    accessStrategy = 'superAdmin';
  }

  // Checks whether the user has access to the resource
  checkAccessOrError(userRoles, accessStrategy, resourceType);

  return {
    db,
    session,
    userId: session.user.id,
    userRoles,
    accessStrategy
  };
};


// Client Services

export async function getResponseOrError(request: Response) {
  if (request.status >= 400) {
    const { message } = await request.json() as { message: string };
    return error(request.status, message);
  }
  return request.json();
}
