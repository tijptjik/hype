// BETTER-AUTH CLIENT
// This is the client-side auth module for SvelteKit

// BETTER-AUTH
import { createAuthClient } from 'better-auth/svelte';
import { customSessionClient } from 'better-auth/client/plugins';
// TYPES
import type { Auth } from '$lib/auth';

export const authClient = createAuthClient({
  plugins: [
    customSessionClient<Auth>()
  ]
});

// Export commonly used auth functions for compatibility
export const { signIn, signOut, signUp, useSession } = authClient;