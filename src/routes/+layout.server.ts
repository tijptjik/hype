import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
    const dev = process.env.NODE_ENV !== 'production';
    return {
        session: await event.locals.auth(),
        authProviders: {
            google: {
                clientId: dev ? process.env.AUTH_GOOGLE_ID : event.platform?.env?.AUTH_GOOGLE_ID
            }
        }
    };
};