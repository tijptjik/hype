// NODE
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
// FILESYSTEM
import { mkdir, readFile, writeFile } from 'node:fs/promises'

// This fixture represents the reviewed baseline registry, not a published current API release.
const root = new URL('../../', import.meta.url)
const source = new URL(
  '../saanseoi/fixtures/meta/curations/hkgov-landsd-street-baseline.json',
  root,
)
const codes = JSON.parse(
  await readFile(
    new URL('../saanseoi/fixtures/meta/divisionCodes/geographic.json', root),
    'utf8',
  ),
)
const registry = JSON.parse(await readFile(source, 'utf8'))
const districtCodes = new Set<string>(
  codes.assignments
    .filter((item: { divisionClass: string }) => item.divisionClass === 'district')
    .map((item: { divisionCode: string }) => item.divisionCode),
)
// Publisher abbreviations differ from SaanSeoi divisionCode values.
const bridge: Record<string, string> = {
  'C&W': 'CW',
  E: 'EST',
  I: 'ILD',
  IS: 'ILD',
  'K&T': 'KTS',
  KC: 'KLC',
  N: 'NTH',
  S: 'STH',
  'W.C.': 'WC',
}
const rows = registry.records
  .map(
    (row: {
      streetId: string
      names: { en: string; zhHant: string }
      districtCodes: string[]
    }) => ({
      id: row.streetId,
      names: { en: row.names.en, 'zh-Hant': row.names.zhHant },
      divisionCodes: [
        ...new Set(
          row.districtCodes
            .flatMap(value => value.normalize('NFKC').split(/\s*-\s*|[／、]/u))
            .map(value => {
              const token = value.trim().toUpperCase()
              const code = bridge[token] ?? token
              if (!districtCodes.has(code))
                throw new Error(`Unresolved district code: ${value}`)
              return code
            }),
        ),
      ].sort(),
    }),
  )
  .sort((a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
if (new Set(rows.map((row: { id: string }) => row.id)).size !== rows.length)
  throw new Error('Duplicate street IDs')
const body = JSON.stringify(rows) + '\n'
const sha256 = createHash('sha256').update(body).digest('hex')
const directory = new URL('static/mocks/saanseoi/streets/names/', root)
await mkdir(directory, { recursive: true })
await writeFile(new URL('data.json', directory), body)
await writeFile(
  new URL('manifest.json', directory),
  JSON.stringify(
    {
      schemaVersion: 1,
      mock: true,
      apiReleaseSetId: null,
      family: 'streets',
      region: 'hk',
      projection: 'names',
      selection: 'reviewed-baseline-fixture',
      source: {
        baselineSha256: registry.baselineSha256,
        divisionCodeRegistryHash: codes.versionHash,
      },
      divisionScope: {
        family: 'divisions',
        domain: 'geographic',
        variant: 'saanseoi',
        class: 'district',
      },
      locales: ['en', 'zh-Hant'],
      recordCount: rows.length,
      representations: [
        {
          format: 'json',
          envelope: 'array',
          files: [
            {
              href: 'data.json',
              recordCount: rows.length,
              byteLength: Buffer.byteLength(body),
              sha256,
            },
          ],
        },
      ],
    },
    null,
    2,
  ) + '\n',
)
console.log(
  `${rows.length} streets; ${Buffer.byteLength(body)} bytes; ${gzipSync(body).length} bytes gzipped`,
)
