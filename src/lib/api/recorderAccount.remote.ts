// SVELTE
import { getRequestEvent, query } from '$app/server'

/** @returns The signed-in contributor's HYPE identity, or null for a guest. */
export const recorderAccount = query(() => {
  const { user } = getRequestEvent().locals
  return user && !user.isAnonymous
    ? { id: user.id, name: user.name, image: user.image, email: user.email }
    : null
})
