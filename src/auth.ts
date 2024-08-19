import { SvelteKitAuth } from '@auth/sveltekit';
import GoogleProvider from '@auth/sveltekit/providers/google';
import { PRIVATE_AUTH_GOOGLE_ID, PRIVATE_AUTH_GOOGLE_SECRET, PRIVATE_AUTH_SECRET } from '$env/static/private';
import { D1Adapter } from '@auth/d1-adapter';

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
			adapter: D1Adapter(event.platform?.env.DB),
			session: {
				strategy: 'database',
				maxAge: 30 * 24 * 60 * 60, // 30 days
				updateAge: 24 * 60 * 60 // update session age every 24 hours
			},
			debug: true,
			callbacks: {
				async session({ session, token }) {
					// Include the user ID (sub) in the session
					if (token?.sub) {
						session.user.id = token.sub;
					}
					return session;
				}
			}
		};
	})
;