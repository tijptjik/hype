// SQLITE
import { Database as SQLite } from 'bun:sqlite'
// NODE
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
// DATABASE
import { sql } from 'drizzle-orm'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import { prepareOrganisationRevisionCapture } from '../../../src/lib/db/services/organisationRevision'
import { prepareAdminResourceRevisionCapture } from '../../../src/lib/db/services/adminResourceRevision'
import { preparePropertyCatalogCapture } from '../../../src/lib/db/services/propertyCatalogRevision'
import { registerImageRevisionBaseline } from '../../../src/lib/db/services/imageRevisionBaseline'
import { enrollResourceLogo } from '../../../src/lib/db/services/resourceLogoRevision'
// ROLLOUT
import { rehearseFeatureLifecycle } from '../../dev/feature-lifecycle/rehearse'
import { prepareLifecycleSchemaGroup } from './lifecycle-schema'
import {
  prepareLegacyDraftConversion,
  applyLegacyDraftConversion,
} from '../../dev/feature-lifecycle/convert-drafts'
import { enrollLegacyRevisions } from '../enroll'
import { cacheRevisionMedia, mediaCacheKey } from '../cache-media'
import { verifiedRetainedPin } from '../retained-media'
import {
  atomic,
  completeness,
  digest,
  fences,
  fingerprint,
  identifier,
  schemaFingerprint,
} from './contract'
// TYPES
import type { Group, Plan, Statement } from './contract'

type Domain = ReturnType<typeof openSqliteDomain>

/** Inventory executable source, migrations and lockfiles, including uncommitted release work. @returns Sorted repository-relative paths. */
export function releaseSourceFiles(): string[] {
  const inventory = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
  if (inventory.status !== 0) throw new Error('Cannot inventory release source')
  const files = [...new Set(inventory.stdout.split('\0').filter(Boolean))].filter(
    file =>
      (/^(src|scripts|workers|migrations|messages|patches|project\.inlang)\//.test(
        file,
      ) ||
        [
          'package.json',
          'bun.lock',
          'wrangler.toml',
          'vite.config.ts',
          'svelte.config.js',
          'tsconfig.json',
          '.github/workflows/deploy.yml',
        ].includes(file)) &&
      !file.startsWith('src/lib/paraglide/') &&
      existsSync(file),
  )
  return files.sort()
}
/** Hash the exact release source inventory. @returns Content fingerprint. */
export function releaseSourceHash(): string {
  return digest(
    releaseSourceFiles().map(file => [
      file,
      digest(readFileSync(file).toString('base64')),
    ]),
  )
}
/** Canonical tables for enrollment checks; derived search is rebuilt by the existing exporter. @param d Offline domain. @returns Table names. */
export function tables(d: Domain): string[] {
  return (
    d.sqlite
      .query("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
  )
    .map(r => r.name)
    .filter(n => !/^(sqlite_|_cf_|featureSearchFts|_revisionDeployment)/.test(n))
}
/** Preserve every non-journal projection through enrollment. @param d Offline database. @returns Hashes excluding only clocks for deterministic remote migration comparison. */
function projections(d: Domain): Plan['expected'] {
  return Object.fromEntries(
    tables(d)
      .filter(
        t =>
          !/^(revision|featureRevision|imageRevision|imageAssetVersion|featureBaselineAttribution|resourceLogoImageHead|featureInitialRevision|featureImageUploadRevision|organisationRevision|projectRevision|layerRevision|hubRevision|propertyCatalogRevision)/.test(
            t,
          ),
      )
      .map(t => [
        t,
        fingerprint(
          d.sqlite.query(`SELECT * FROM ${identifier(t)}`).all() as Record<
            string,
            unknown
          >[],
          true,
        ),
      ]),
  )
}
/** Record a complete release from an isolated production export. @param source Restored production snapshot. @param directory New private artifact directory. @param target Explicit environment/database identity. @param cacheMedia Exact media downloader, injectable for offline rehearsal tests. @param options Explicit accepted-lifecycle schema cutover after baseline enrollment. @returns Immutable plan. @remarks No Breadline imports, personas, fixtures, R2 writes or live database writes occur here. Missing media fails closed. */
export async function prepareRelease(
  source: string,
  directory: string,
  target: string,
  cacheMedia: typeof cacheRevisionMedia = cacheRevisionMedia,
  options: { featureLifecycle?: 'current' } = {},
): Promise<Plan> {
  mkdirSync(directory, { mode: 0o700 })
  const database = join(directory, 'prepared.sqlite')
  const backup = spawnSync(
    'python3',
    [
      '-c',
      'import sqlite3,sys; s=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
      source,
      database,
    ],
    { encoding: 'utf8' },
  )
  if (backup.status !== 0) throw new Error('Snapshot backup failed')
  let d = openSqliteDomain(database)
  const initialSchema = schemaFingerprint(
    d.sqlite
      .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
      .all() as Record<string, unknown>[],
  )
  const initial = Object.fromEntries(
    tables(d).map(t => [
      t,
      fingerprint(
        d.sqlite.query(`SELECT * FROM ${identifier(t)}`).all() as Record<
          string,
          unknown
        >[],
      ),
    ]),
  )
  const currentLifecycle = (
    d.sqlite.query("PRAGMA table_info('feature')").all() as { name: string }[]
  ).some(column => column.name === 'currentRevisionId')
  d.close()
  if (currentLifecycle)
    return prepareCurrentLifecycleRelease(
      database,
      directory,
      target,
      initial,
      initialSchema,
    )
  const schemaFile = join(directory, 'schema-groups.json')
  const migration = spawnSync(
    'python3',
    ['scripts/revisions/production/prepare-schema.py', database, schemaFile],
    { encoding: 'utf8' },
  )
  writeFileSync(
    join(directory, 'migrations.log'),
    migration.stdout + migration.stderr,
    { mode: 0o600 },
  )
  if (migration.status !== 0)
    throw new Error('Migration rehearsal failed; inspect private migrations.log')
  const groups = JSON.parse(readFileSync(schemaFile, 'utf8')) as Group[]
  const media = join(directory, 'media')
  const cached = await cacheMedia(database, media, { baselineOnly: true })
  if (cached.blocked)
    throw new Error(
      `${cached.blocked} images require explicit source repair before rollout`,
    )
  d = openSqliteDomain(database)
  try {
    const expected = projections(d)
    // Capture actual domain batches, preserving their transaction boundaries for D1 replay.
    const batch = d.db.batch.bind(d.db)
    d.db.batch = (async (queries: Parameters<typeof d.db.batch>[0]) => {
      const statements = queries.map(q =>
        (q as unknown as { toSQL(): Statement }).toSQL(),
      )
      const result = await batch(queries)
      groups.push({ label: `enrollment-${groups.length}`, statements })
      return result
    }) as unknown as typeof d.db.batch
    const gate: Statement = {
      sql: 'UPDATE adminResourceRevisionRollout SET enabled=1',
      params: [],
    }
    d.sqlite.exec(gate.sql)
    groups.push({ label: 'admin-recording', statements: [gate] })
    const enrollment = await enrollLegacyRevisions(
      database,
      media,
      join(directory, 'feature-enrollment.json'),
      d,
      { baselineOnly: true },
    )
    if (enrollment.blocked)
      throw new Error(
        'Feature enrollment is incomplete; deployment plan was not produced',
      )
    const evidence = JSON.parse(
      readFileSync(join(media, 'receipt.json'), 'utf8'),
    ).evidence
    const logos = d.sqlite
      .query(
        'SELECT DISTINCT id FROM image WHERE id IN (SELECT imageId FROM organisation UNION SELECT imageId FROM project UNION SELECT imageId FROM hub)',
      )
      .all() as { id: string }[]
    for (const { id } of logos) {
      const row = evidence.find((r: { locator: { id: string } }) => r.locator.id === id)
      if (!row || row.status !== 'verified')
        throw new Error('Logo evidence unavailable')
      const i = row.locator,
        base = join(media, mediaCacheKey(i))
      const pin =
        verifiedRetainedPin(d.sqlite, i, {
          contentHash: row.contentHash,
          byteSize: readFileSync(base + '.image').length,
          mediaType: row.mediaType,
          metadata: JSON.parse(readFileSync(base + '.json', 'utf8')),
        }) ??
        (await registerImageRevisionBaseline(d.db, {
          imageId: id,
          actorId: 'system:revision-rollout',
          origin: 'migration',
          guard: sql`1`,
          expectedModifiedAt: i.modifiedAt,
          expectedVersion: i.version,
          storageNamespace: i.env,
          storageKey: i.publicId,
          bytes: Uint8Array.from(readFileSync(base + '.image')).buffer,
          mediaType: row.mediaType,
          metadata: JSON.parse(readFileSync(base + '.json', 'utf8')),
          captureCurrentPresentation: true,
        }))
      if (
        !pin ||
        !(await enrollResourceLogo(d.db, {
          imageId: id,
          imageRevisionId: pin.imageRevisionId,
          guard: sql`1`,
          actorId: 'system:revision-rollout',
        }))
      )
        throw new Error('Logo enrollment failed')
    }
    const actor = {
      actorId: 'system:revision-rollout',
      origin: 'system' as const,
      reason: 'Initial production revision baseline',
    }
    for (const resource of ['organisation', 'project', 'layer', 'hub'] as const) {
      const ids = d.sqlite.query(`SELECT id FROM ${resource} ORDER BY id`).all() as {
        id: string
      }[]
      for (const { id } of ids) {
        const capture =
          resource === 'organisation'
            ? await prepareOrganisationRevisionCapture(
                d.db,
                sql`SELECT id FROM organisation WHERE id=${id}`,
                actor,
              )
            : await prepareAdminResourceRevisionCapture(
                d.db,
                resource,
                sql`SELECT id FROM ${sql.identifier(resource)} WHERE id=${id}`,
                actor,
              )
        if (capture.before.length)
          await d.db.batch([...capture.before, ...capture.after] as never)
        if (resource !== 'layer') {
          const catalog = await preparePropertyCatalogCapture(
            d.db,
            { scope: resource, id },
            actor,
          )
          if (catalog.before.length)
            await d.db.batch([...catalog.before, ...catalog.after] as never)
        }
      }
    }
    // Only explicit rollout switches may differ from migrated source projections.
    delete expected.adminResourceRevisionRollout
    const after = projections(d)
    delete after.adminResourceRevisionRollout
    if (digest(after) !== digest(expected))
      throw new Error(
        'Enrollment changed source projections: ' +
          Object.keys(after)
            .filter(t => digest(after[t]) !== digest(expected[t]))
            .join(','),
      )
    for (const check of completeness()) d.sqlite.query(check.sql).all(...check.params)
    if (options.featureLifecycle === 'current') {
      // Rehearse first, then replay the portable D1 group with foreign keys enabled.
      const converted = join(directory, 'lifecycle-schema.sqlite')
      await rehearseFeatureLifecycle(database, converted, { cleanupDrafts: false })
      const targetSnapshot = new SQLite(converted, { readonly: true })
      try {
        const group = prepareLifecycleSchemaGroup(d.sqlite, targetSnapshot)
        await atomic(d.binding, group.statements)
        groups.push(group)
        for (const table of tables(d)) {
          const expectedRows = fingerprint(
            targetSnapshot.query(`SELECT * FROM ${identifier(table)}`).all() as Record<
              string,
              unknown
            >[],
          )
          const actualRows = fingerprint(
            d.sqlite.query(`SELECT * FROM ${identifier(table)}`).all() as Record<
              string,
              unknown
            >[],
          )
          if (digest(expectedRows) !== digest(actualRows))
            throw new Error(`Lifecycle replay differs: ${table}`)
        }
      } finally {
        targetSnapshot.close()
      }
      for (const group of prepareLegacyDraftConversion(d.sqlite)) {
        await atomic(d.binding, group.statements)
        groups.push(group)
      }
      for (const check of completeness(true))
        d.sqlite.query(check.sql).all(...check.params)
      // Preserve the existing projection contract and add exact lifecycle/media evidence.
      // Unrelated resource journals mint their own SQL IDs during enrollment replay;
      // their completeness checks remain mandatory instead of comparing rehearsal IDs.
      Object.assign(expected, projections(d))
      const finalTables = tables(d)
      for (const table of finalTables.filter(name =>
        /^(featureRevision|featureIdentityOperation|featureUploadEvidence|revisionChangeSet|imageRevision|imageAssetVersion)/.test(
          name,
        ),
      ))
        expected[table] = fingerprint(
          d.sqlite.query(`SELECT * FROM ${identifier(table)}`).all() as Record<
            string,
            unknown
          >[],
          true,
        )
      for (const table of Object.keys(expected))
        if (!finalTables.includes(table)) delete expected[table]
    }
    for (const group of groups) {
      const all = [
        ...group.statements,
        ...(group.tables ? fences(group.fenceTables ?? group.tables) : []),
      ]
      if (
        all.length + 4 > 950 ||
        all.some(s => Buffer.byteLength(s.sql) > 95_000 || s.params.length > 100)
      )
        throw new Error(`Oversized atomic unit: ${group.label}`)
    }
    const plan: Plan = {
      version: 1,
      ...(options.featureLifecycle
        ? { featureLifecycle: options.featureLifecycle }
        : {}),
      target,
      sourceHash: releaseSourceHash(),
      initialSchema,
      expectedSchema: schemaFingerprint(
        d.sqlite
          .query(
            'SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL',
          )
          .all() as Record<string, unknown>[],
      ),
      initial,
      expected,
      groups,
      tables: tables(d),
      migrations: (
        d.sqlite.query('SELECT name FROM d1_migrations ORDER BY name').all() as {
          name: string
        }[]
      ).map(r => r.name),
    }
    writeFileSync(join(directory, 'plan.json'), JSON.stringify(plan) + '\n', {
      mode: 0o600,
      flag: 'wx',
    })
    writeFileSync(
      join(directory, 'receipt.json'),
      JSON.stringify(
        {
          planHash: digest(plan),
          target,
          features: enrollment.features,
          images: enrollment.images,
          groups: groups.length,
          breadlineIntegration: false,
          remoteWrites: false,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
    return plan
  } finally {
    d.close()
  }
}

/** Prepare managed cleanup for an already converted lifecycle snapshot.
 * @param database Isolated snapshot. @param directory Private release artifacts.
 * @param target Explicit environment/database identity. @param initial Exact source fingerprints.
 * @param initialSchema Exact source schema. @returns Rehearsed, journal-compatible release plan.
 * @remarks Every cleanup group is atomic and preserves before-images; no live writes occur here.
 */
function prepareCurrentLifecycleRelease(
  database: string,
  directory: string,
  target: string,
  initial: Plan['initial'],
  initialSchema: Plan['initialSchema'],
): Plan {
  const d = openSqliteDomain(database)
  try {
    if (
      d.sqlite
        .query("SELECT 1 FROM sqlite_master WHERE name='_revisionDeployment'")
        .get()
    )
      d.sqlite.exec('UPDATE _revisionDeployment SET writable=1')
    const groups = prepareLegacyDraftConversion(d.sqlite)
    for (const group of groups) {
      if (
        group.statements.length + 4 > 950 ||
        group.statements.some(
          statement =>
            Buffer.byteLength(statement.sql) > 95_000 || statement.params.length > 100,
        )
      )
        throw new Error(`Oversized cleanup unit: ${group.label}`)
      d.sqlite.exec('BEGIN')
      try {
        applyLegacyDraftConversion(d.sqlite, [group])
        d.sqlite.exec('COMMIT')
      } catch (error) {
        d.sqlite.exec('ROLLBACK')
        throw error
      }
    }
    for (const check of completeness(true)) {
      try {
        d.sqlite.query(check.sql).all(...check.params)
      } catch {
        throw new Error(
          'Lifecycle cleanup requires completed resource baseline enrollment: ' +
            check.sql,
        )
      }
    }
    const expected = Object.fromEntries(
      tables(d).map(table => [
        table,
        fingerprint(
          d.sqlite.query(`SELECT * FROM ${identifier(table)}`).all() as Record<
            string,
            unknown
          >[],
          true,
        ),
      ]),
    )
    const plan: Plan = {
      version: 1,
      featureLifecycle: 'current',
      target,
      sourceHash: releaseSourceHash(),
      initial,
      initialSchema,
      expected,
      expectedSchema: schemaFingerprint(
        d.sqlite
          .query(
            'SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL',
          )
          .all() as Record<string, unknown>[],
      ),
      groups,
      tables: tables(d),
      migrations: (
        d.sqlite.query('SELECT name FROM d1_migrations ORDER BY name').all() as {
          name: string
        }[]
      ).map(row => row.name),
    }
    writeFileSync(join(directory, 'plan.json'), JSON.stringify(plan) + '\n', {
      mode: 0o600,
      flag: 'wx',
    })
    writeFileSync(
      join(directory, 'receipt.json'),
      JSON.stringify(
        {
          planHash: digest(plan),
          target,
          convertedLegacyDrafts: groups.length,
          remoteWrites: false,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    )
    return plan
  } finally {
    d.close()
  }
}
