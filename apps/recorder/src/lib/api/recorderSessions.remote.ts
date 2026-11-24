// SVELTEKIT
import { command, query } from '$app/server'
// TYPES
import type {
  RecorderLocation,
  RecorderRecord,
  RecorderPlacement,
  RecorderSession,
} from '../../../../../src/lib/fieldResearch/recorder'

/** @returns The static client only bundles proxies for HYPE's remote functions. */
function remoteOnly(): never {
  throw new Error('Recorder requests must run on HYPE.')
}

/** @returns Available sessions. */
export const recorderSessions = query((): RecorderSession[] => remoteOnly())
/** @param id Session identity. @returns Assigned Locations. */
export const recorderLocations = query('unchecked', (_id: string): RecorderLocation[] =>
  remoteOnly(),
)
/** @param id Session identity. @returns Shared records. */
export const recorderRecords = query('unchecked', (_id: string): RecorderRecord[] =>
  remoteOnly(),
)
/** @param input Session and capture identity. @returns The persisted capture ID. */
export const recordFeature = command(
  'unchecked',
  (_input: {
    id: string
    sessionId: string
    layerId?: string
    placement?: RecorderPlacement
  }): string => remoteOnly(),
)
