// SVELTE
import { browser } from '$app/env'

/** Load the expression-free renderer with the messaging route, so cached packs render after going offline.
 * @remarks The server never imports the DOM-dependent player. Loading starts with the
 * route so the player can be cached for offline use; a failed load resolves to undefined.
 */
export const stickerPlayer = browser
  ? import('lottie-web/build/player/lottie_light')
      .then(module => module.default)
      .catch(() => undefined)
  : Promise.resolve(undefined)
