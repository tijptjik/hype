// NODE
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
// SYNC
import { emptyUserSyncLocalState, type UserSyncLocalState } from './user-sync'

/** Read private sync state, defaulting only when no accepted file exists.
 * @param path Private state file.
 * @returns Accepted source baseline.
 */
export function readUserSyncState(path: string): UserSyncLocalState {
  if (!existsSync(path)) return emptyUserSyncLocalState()
  const state = JSON.parse(readFileSync(path, 'utf8')) as UserSyncLocalState
  if (state.version !== 1 || !Array.isArray(state.rows))
    throw new Error('Invalid private sync state')
  return state
}

/** Durably replace private state without publishing partially written JSON.
 * @param path Destination under the ignored local directory.
 * @param value JSON-compatible private state.
 * @returns Nothing after file and directory are synced.
 */
export function writeUserSyncState(path: string, value: unknown): void {
  const target = resolve(path)
  if (!target.startsWith(resolve('.local') + '/'))
    throw new Error('Sync state must remain in .local')
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, JSON.stringify(value))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, target)
  const directory = openSync(dirname(target), 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}

/** Hold one local operator lock for planning/application and accepted-state promotion.
 * @param statePath Shared private state path for this target.
 * @returns Release callback. Crashed locks require explicit operator inspection/removal.
 * @remarks Never steal a lock on a timeout; it may belong to another active operator.
 */
export function lockUserSyncState(statePath: string): () => void {
  const path = resolve(statePath) + '.lock'
  if (!path.startsWith(resolve('.local') + '/'))
    throw new Error('Sync state must remain in .local')
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    )
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  return () => rmSync(path)
}
