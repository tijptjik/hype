// SVELTE
import { browser } from '$app/env'

/** Load the expression-free renderer with the messaging route, so cached packs render after going offline.
 * @remarks The server never imports the DOM-dependent player. The client module is ready before mounting.
 */
export const stickerPlayer = browser
  ? (await import('lottie-web/build/player/lottie_light')).default
  : undefined
