import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// MAP
import { REGISTERED_MAP_STYLE_CATALOG } from '../src/lib/map/styles/catalog'
import { getMapStyleCatalogI18n } from '../src/lib/map/styles/i18n'

type SyncTarget = 'local' | 'preview' | 'prod'

type SyncTargetConfig = {
  databaseName: string
  wranglerArgs: string[]
}

const TARGET_CONFIG: Record<SyncTarget, SyncTargetConfig> = {
  local: {
    databaseName: 'hype-db-local',
    wranglerArgs: [],
  },
  preview: {
    databaseName: 'hype-db-preview',
    wranglerArgs: ['--remote', '--env', 'preview'],
  },
  prod: {
    databaseName: 'hype-db-prod',
    wranglerArgs: ['--remote', '--env', 'production'],
  },
}

const escapeSqlString = (value: string): string => value.replaceAll("'", "''")

const toSqlLiteral = (value: string | null | undefined): string =>
  value == null ? 'NULL' : `'${escapeSqlString(value)}'`

const toLookupIdSql = (
  tableName: 'hub' | 'organisation',
  code: string | null | undefined,
): string =>
  code == null
    ? 'NULL'
    : `(SELECT "id" FROM "${tableName}" WHERE "code" = ${toSqlLiteral(code)} LIMIT 1)`

const toStableMapStyleId = (key: string): string => {
  const digest = new Bun.CryptoHasher('sha1').update(`map-style:${key}`).digest('hex')
  return digest.slice(0, 12)
}

const buildSyncSql = (): string => {
  const statements: string[] = ['BEGIN TRANSACTION;']

  // Upsert persisted map-style rows from the checked-in catalog.
  for (const entry of REGISTERED_MAP_STYLE_CATALOG) {
    const mapStyleId = toStableMapStyleId(entry.key)
    statements.push(`
INSERT INTO "mapStyles" ("id", "code", "organisationId", "hubId", "previewImagePath")
VALUES (
  ${toSqlLiteral(mapStyleId)},
  ${toSqlLiteral(entry.key)},
  ${toLookupIdSql('organisation', entry.organisationCode)},
  ${toLookupIdSql('hub', entry.hubCode)},
  NULL
)
ON CONFLICT("code") DO UPDATE SET
  "id" = excluded."id",
  "organisationId" = excluded."organisationId",
  "hubId" = excluded."hubId",
  "previewImagePath" = NULL;`.trim())

    const localizedCopy = getMapStyleCatalogI18n(entry.key)
    for (const [locale, copy] of Object.entries(localizedCopy)) {
      statements.push(`
INSERT INTO "mapStyleI18n" (
  "mapStyleId",
  "locale",
  "name",
  "nameGen",
  "description",
  "descriptionGen"
)
VALUES (
  ${toSqlLiteral(mapStyleId)},
  ${toSqlLiteral(locale)},
  ${toSqlLiteral(copy.name)},
  0,
  ${toSqlLiteral(copy.description)},
  0
)
ON CONFLICT("mapStyleId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = 0,
  "description" = excluded."description",
  "descriptionGen" = 0;`.trim())
    }
  }

  statements.push('COMMIT;')

  return `${statements.join('\n\n')}\n`
}

const parseTarget = (rawTarget: string | undefined): SyncTarget => {
  if (rawTarget === 'local' || rawTarget === 'preview' || rawTarget === 'prod') {
    return rawTarget
  }

  throw new Error('Usage: bun run scripts/sync-map-styles.ts <local|preview|prod>')
}

const main = async (): Promise<void> => {
  const target = parseTarget(process.argv[2])
  const { databaseName, wranglerArgs } = TARGET_CONFIG[target]
  const tempDir = await mkdtemp(join(tmpdir(), 'hype-map-style-sync-'))
  const sqlFile = join(tempDir, `sync-map-styles-${target}.sql`)

  try {
    await Bun.write(sqlFile, buildSyncSql())

    const wranglerProcess = Bun.spawn(
      ['bunx', 'wrangler', 'd1', 'execute', databaseName, ...wranglerArgs, `--file=${sqlFile}`],
      {
        stdout: 'inherit',
        stderr: 'inherit',
      },
    )

    const exitCode = await wranglerProcess.exited
    if (exitCode !== 0) {
      throw new Error(`Map-style sync failed for ${target} with exit code ${exitCode}`)
    }

    console.log(`✅ Synced map styles for ${target}`)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

await main()
