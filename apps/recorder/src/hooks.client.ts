// API
import { installRemoteTransport } from '#lib/hype.js'

/** @returns After installing transport for calls made by the bundled frontend. */
export function init(): void {
  installRemoteTransport()
}
