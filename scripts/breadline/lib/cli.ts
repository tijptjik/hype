// NODE
import { resolve } from 'node:path'

// TYPES
import type { MirrorSyncOptions, SyncMode } from './types'

const DEFAULT_MIRROR_PATH = '.local/breadline/mirror.sqlite'

/** Parsed options for schema inspection. */
export interface InspectCliOptions {
  schemas: string[]
  outputPath: string
}

/**
 * Read a required value following a CLI flag.
 * @param args Complete argument list.
 * @param index Index of the flag in the argument list.
 * @returns The following argument.
 */
function readFlagValue(args: string[], index: number): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Expected a value after ${args[index]}`)
  }
  return value
}

/**
 * Parse common schema-selection flags.
 * @param args Command-line arguments after the script name.
 * @returns Requested schemas and output path.
 */
export function parseInspectArgs(args: string[]): InspectCliOptions {
  const schemas: string[] = []
  let outputPath = '.local/breadline/source-schema.json'

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--schema') {
      schemas.push(readFlagValue(args, index))
      index += 1
    } else if (arg === '--output') {
      outputPath = readFlagValue(args, index)
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return {
    schemas: schemas.length > 0 ? schemas : ['public'],
    outputPath: resolve(outputPath),
  }
}

/**
 * Parse source-to-mirror synchronization flags.
 * @param args Command-line arguments after the script name.
 * @returns Validated synchronization options.
 */
export function parseSyncArgs(args: string[]): MirrorSyncOptions {
  const schemas: string[] = []
  const tables: string[] = []
  let mirrorPath = DEFAULT_MIRROR_PATH
  let mode: SyncMode = 'auto'
  let batchSize = 2_000
  let overlapSeconds = 300

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--schema') {
      schemas.push(readFlagValue(args, index))
      index += 1
    } else if (arg === '--table') {
      tables.push(readFlagValue(args, index))
      index += 1
    } else if (arg === '--mirror') {
      mirrorPath = readFlagValue(args, index)
      index += 1
    } else if (arg === '--batch-size') {
      batchSize = Number.parseInt(readFlagValue(args, index), 10)
      index += 1
    } else if (arg === '--overlap-seconds') {
      overlapSeconds = Number.parseInt(readFlagValue(args, index), 10)
      index += 1
    } else if (arg === '--full') {
      mode = 'full'
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
    throw new Error('--batch-size must be an integer between 1 and 10000')
  }
  if (
    !Number.isInteger(overlapSeconds) ||
    overlapSeconds < 0 ||
    overlapSeconds > 86_400
  ) {
    throw new Error('--overlap-seconds must be between 0 and 86400')
  }

  return {
    mirrorPath: resolve(mirrorPath),
    schemas: schemas.length > 0 ? schemas : ['public'],
    tables,
    mode,
    batchSize,
    overlapSeconds,
  }
}

/**
 * Resolve the mirror path accepted by the status command.
 * @param args Command-line arguments after the script name.
 * @returns Absolute mirror database path.
 */
export function parseStatusArgs(args: string[]): string {
  if (args.length === 0) return resolve(DEFAULT_MIRROR_PATH)
  if (args.length === 2 && args[0] === '--mirror') {
    return resolve(args[1])
  }
  throw new Error('Usage: breadline:db:status [--mirror path]')
}
