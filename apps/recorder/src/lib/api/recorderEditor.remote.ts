// SVELTEKIT
import { command, query } from '$app/server'
// TYPES
import type {
  RecorderEditor,
  RecorderEdit,
} from '../../../../../src/lib/fieldResearch/recorderEditor'
/** @returns Native builds contain only the remote proxy. */
function remoteOnly(): never {
  throw new Error('Record editor requests must run on HYPE.')
}
/** @param id Record identity. @returns Editor state. */
export const recorderEditor = query(
  'unchecked',
  (_id: string): RecorderEditor => remoteOnly(),
)
/** @param input Versioned edits. @returns Saved editor. */
export const saveRecorder = command(
  'unchecked',
  (_input: RecorderEdit): RecorderEditor => remoteOnly(),
)
