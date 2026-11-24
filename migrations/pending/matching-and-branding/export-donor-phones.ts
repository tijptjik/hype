// NODE
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// BREADLINE
import {
  createBreadlineSource,
  formatBreadlineError,
  loadBreadlineDatabaseConfig,
} from '../../../scripts/breadline/lib/config'
import { normalizeHongKongPhoneNumber } from '../../../src/lib/utils/phone-property'

/**
 * Freeze the source telephone and canonical Hype representation for every selected donor.
 * @param directory Pinned matching and branding release containing the donor crosswalk.
 * @param output New private output file.
 * @returns Once a complete, uniquely identified source snapshot has been saved.
 */
async function exportPhones(directory: string, output: string): Promise<void> {
  const release = JSON.parse(
    readFileSync(join(directory, 'curation.json'), 'utf8'),
  ) as {
    expected: { crosswalk: [string, string, string, string][] }
  }
  const ids = release.expected.crosswalk
    .filter(([table]) => table === 'donors')
    .map(([, id]) => String(id))
  if (!ids.length || new Set(ids).size !== ids.length)
    throw new Error('Invalid release donor IDs')
  const source = createBreadlineSource(loadBreadlineDatabaseConfig())
  try {
    const donors = await source<{ id: string; phone: string | null }[]>`
      SELECT id::text AS id,phone FROM public.donors WHERE id IN ${source(ids.map(Number))} ORDER BY id`
    if (donors.length !== ids.length || donors.some(row => !ids.includes(row.id)))
      throw new Error('Production donor IDs differ from the release')
    const rows = donors.map(({ id, phone: raw }) => ({
      id,
      raw,
      canonical: normalizeHongKongPhoneNumber(raw ?? ''),
    }))
    writeFileSync(
      output,
      JSON.stringify({ capturedAt: new Date().toISOString(), rows }) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
    console.log(`Exported ${rows.length} donor phone records`)
  } finally {
    await source.close()
  }
}
const [directory, output] = process.argv.slice(2)
if (!directory || !output || process.argv.length !== 4)
  throw new Error('Usage: export-donor-phones.ts PACKAGE NEW_PRIVATE_EXPORT')
try {
  await exportPhones(directory, output)
} catch (error) {
  console.error(formatBreadlineError(error))
  process.exitCode = 1
}
