import { error, type RequestHandler } from '@sveltejs/kit';
import {
  getDatabaseOrError,
  getSessionOrError,
  JSONResponseOrError,
  type AccessStrategyOption
} from '$lib/api';
import client, { genericResourceQuery } from '$lib/db';
import { organisationRole, user } from '$lib/db/schema';
import * as schema from '$lib/db/schema';

const RESOURCE_TYPE = 'user';
const TABLE = user;
// TODO: Restrict access to Organisation / Project Owners
const ACCESS_STRATEGY = 'ResourceAll' as AccessStrategyOption;
const PUBLIC_IDENTIFIER = 'id';

export const GET: RequestHandler = async ({ url, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    // DB : Build & Execute Query
    const result = await genericResourceQuery(
      db,
      user,
      url.searchParams.get('q') as string,
      ['name', 'email'],
      accessStrategy,
      {
        email: false,
        emailVerified: false,
        createdAt: false,
        modifiedAt: false
      },
      {
        memberships: true,
        projectRoles: true
      }
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(result);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};

// export const GET: RequestHandler = async ({ locals, platform }) => {
//   // AUTH : Pass or Fail
//   await getSessionOrError(locals);
//   // DB : Connect to D1
//   const db = client(platform?.env.DB);
//   try {
//     // DB : Build & Execute Query
//     const result = await db.query.user.findMany({
//       columns: {
//         email: false,
//         emailVerified: false,
//         createdAt: false,
//         modifiedAt: false
//       },
//       with: {
//         memberships: {
//           columns: {
//             role: true
//           },
//           with: {
//             organisation: {
//               columns: {
//                 createdAt: false,
//                 modifiedAt: false
//               }
//             }
//           }
//         }
//       }
//     });
//     // HTTP : 200 JSON or 404
//     return JSONResponseOrError(result);
//   } catch (e) {
//     // DB : Query Error
//     console.error('Database query error:', e);
//     // HTTP : 500 Error
//     throw error(500, 'Dust Accumulation Critical');
//   }
// };
