import { SvelteKitAuth } from '@auth/sveltekit';
import GoogleProvider from '@auth/sveltekit/providers/google';
import { PRIVATE_AUTH_GOOGLE_ID, PRIVATE_AUTH_GOOGLE_SECRET, PRIVATE_AUTH_SECRET } from '$env/static/private';

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
		trustHost: true
	};
});