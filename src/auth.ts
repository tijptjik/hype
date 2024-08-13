import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import dotenv from 'dotenv';

// Load environment variables from .env file during development
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

export const { handle, signIn, signOut } = SvelteKitAuth(async (event) => {
  //   TODO proper stage detection
	const dev = process.env.NODE_ENV !== 'production';
    const envScope = dev ? process.env : event.platform?.env
    return {
        providers: [
            Google({
                clientId: envScope?.AUTH_GOOGLE_ID,
                clientSecret: envScope?.AUTH_GOOGLE_SECRET
            })
        ],
        secret: envScope?.AUTH_SECRET,
        trustHost: true
    };
});