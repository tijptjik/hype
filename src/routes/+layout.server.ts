import type { LayoutServerLoad } from './$types';
// import {PRIVATE_AUTH_GOOGLE_ID} from '$env/static/private';

export const load: LayoutServerLoad = async (event) => {
	return {
		session: await event.locals.auth(),
		authProviders: {
			google: {
				// clientId: PRIVATE_AUTH_GOOGLE_ID
			}
		}
	};
};