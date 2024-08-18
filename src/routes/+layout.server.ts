import type { LayoutServerLoad } from './$types';
import * as env from '$env/static/private';
import * as public_env from '$env/static/public';
console.log(env)
console.log(public_env)

export const load: LayoutServerLoad = async (event) => {
	return {
		session: await event.locals.auth(),
		authProviders: {
			google: {
				clientId: env.PRIVATE_AUTH_GOOGLE_ID
			}
		}
	};
};