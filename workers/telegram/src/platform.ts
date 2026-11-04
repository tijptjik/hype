import type { ICorePlatform } from '@mtcute/core'

/** No browser globals, filesystem hooks, or private protocol payloads in logs. */
export const workersPlatform: ICorePlatform = {
  beforeExit: () => () => {},
  log: () => {},
  getDefaultLogLevel: () => 0,
  getDeviceModel: () => 'HYPE',
  isOnline: () => true,
}
