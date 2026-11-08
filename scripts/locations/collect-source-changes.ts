// NODE
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
// VALIDATION
import { z } from 'zod'
// SOURCE
import {
  LocationSourceChangesInputSchema,
  readSaanSeoiPlaceSourceChanges,
  validateLocationSourceChangesPage,
} from '../../src/lib/locations/sourceChanges'
import type {
  LocationSourceComparisonPin,
  LocationSourceChangesPage,
} from '../../src/lib/locations/sourceChanges'

const manifestSchema = z.strictObject({
  version: z.literal(1),
  request: LocationSourceChangesInputSchema.omit({ cursor: true }),
  pages: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
})

/** Hash exact retained page bytes so resume detects lost or edited evidence. @param text Page bytes. @returns SHA-256 digest. */
function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Replace one private receipt atomically. @param path Destination in the validated directory. @param text Exact JSON bytes. @returns Nothing. */
function atomicWrite(path: string, text: string): void {
  writeFileSync(path + '.tmp', text, { mode: 0o600 })
  renameSync(path + '.tmp', path)
}

/**
 * Collect a reproducible publisher comparison into private local evidence files.
 * @returns Completion after the terminal page or the requested page budget is retained.
 * @remarks Read-only upstream; no database or canonical Location mutation. Resume verifies
 * every page hash, pin, cursor chain and source identity before making another request.
 * Interrupted pages replay idempotently; the manifest advances only after page persistence.
 */
async function main(): Promise<void> {
  const [fromRelease, toRelease, name, pageBudgetText] = process.argv.slice(2)
  const pageBudget = pageBudgetText === undefined ? Infinity : Number(pageBudgetText)
  if (
    pageBudgetText !== undefined &&
    (!Number.isSafeInteger(pageBudget) || pageBudget < 1)
  )
    throw new Error('Page budget must be a positive integer')
  if (!fromRelease || !toRelease || !name || !/^[a-zA-Z0-9_-]+$/.test(name))
    throw new Error(
      'Usage: collect-source-changes.ts fromResourceRelease toResourceRelease receipt-name [pages-per-run]',
    )
  process.umask(0o077)
  const root = realpathSync('.local/places')
  const directory = resolve(root, name)
  mkdirSync(directory, { recursive: true })
  if (realpathSync(directory) !== directory)
    throw new Error('Receipt directory must not be a symlink')
  const manifestPath = resolve(directory, 'manifest.json')
  const request = LocationSourceChangesInputSchema.parse({
    fromRelease,
    toRelease,
    limit: 100,
  })
  const manifest = existsSync(manifestPath)
    ? manifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
    : { version: 1 as const, request, pages: [] as string[] }
  if (JSON.stringify(manifest.request) !== JSON.stringify(request))
    throw new Error('Receipt belongs to a different source comparison')
  let pin: LocationSourceComparisonPin | undefined
  let cursor: string | undefined
  let complete = false
  const seenIds = new Set<string>()
  const seenCursors = new Set<string>()
  const counts = { added: 0, changed: 0, removed: 0 }
  /** Build the next request with resolved release IDs after the first page. @returns Pinned request. */
  const nextRequest = () => ({
    ...request,
    ...(pin ? { fromRelease: pin.fromRelease, toRelease: pin.toRelease } : {}),
    ...(cursor ? { cursor } : {}),
  })
  /** Locate a retained page. @param index Zero-based page number. @returns Private page path. */
  const pagePath = (index: number): string =>
    resolve(directory, `${String(index).padStart(6, '0')}.json`)
  /** Validate cross-page evidence and advance in-memory state. @param page Validated page. @returns Nothing. */
  // Validate identity/cursor uniqueness across the entire comparison, including resumed pages.
  const accept = (page: LocationSourceChangesPage): void => {
    if (complete) throw new Error('Receipt includes pages after comparison completion')
    for (const row of page.records) {
      if (seenIds.has(row.sourceRecordId))
        throw new Error('Duplicate source identity across comparison pages')
      seenIds.add(row.sourceRecordId)
      counts[row.type]++
    }
    if (page.nextCursor && seenCursors.has(page.nextCursor))
      throw new Error('Source cursor cycle')
    if (page.nextCursor) seenCursors.add(page.nextCursor)
    pin = page.pin
    cursor = page.nextCursor ?? undefined
    complete = page.nextCursor === null
  }
  for (const [index, hash] of manifest.pages.entries()) {
    const text = readFileSync(pagePath(index), 'utf8')
    if (digest(text) !== hash)
      throw new Error('Retained source evidence does not match its receipt')
    accept(validateLocationSourceChangesPage(JSON.parse(text), nextRequest(), pin))
  }
  const apiKey = process.env.SAANSEOI_API_KEY ?? process.env.VITE_SAANSEOI_API_KEY
  if (!complete && !apiKey) throw new Error('SaanSeoi API key required')
  let pagesThisRun = 0
  while (!complete && pagesThisRun < pageBudget) {
    const page = await readSaanSeoiPlaceSourceChanges(
      { baseUrl: 'https://api.saanseoi.hk', apiKey: apiKey!, fetch },
      nextRequest(),
      pin,
    )
    const text = JSON.stringify(page, null, 2) + '\n'
    const path = pagePath(manifest.pages.length)
    if (existsSync(path) && digest(readFileSync(path, 'utf8')) !== digest(text))
      throw new Error('Replayed source page differs from interrupted evidence')
    accept(page)
    atomicWrite(path, text)
    manifest.pages.push(digest(text))
    pagesThisRun++
    atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log('Retained source changes', {
      pages: manifest.pages.length,
      counts,
      complete,
    })
  }
  console.log(
    complete
      ? 'Verified complete source comparison'
      : 'Verified partial source comparison checkpoint',
    { pages: manifest.pages.length, counts, complete },
  )
}

if (import.meta.main) await main()
