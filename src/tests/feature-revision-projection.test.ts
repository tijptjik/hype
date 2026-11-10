// FIXTURE ASSERTIONS
import { required } from './fixtures/required'
// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
import { featureDestinationGuard } from '#lib/db/services/featureParentTransfer.js'
// DRIZZLE
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
} from '#lib/db/schema/feature.js'
import { featureImage, image } from '#lib/db/schema/image.js'
import { prepareFeatureDuplicateReview } from '#lib/db/services/featureDuplicateReview.js'
import {
  inspectFeatureIdentitySource,
  buildSelectedFeatureIdentityContent,
  createFeatureIdentityProposal,
  readFeatureIdentityProposal,
  decideFeatureIdentityProposal,
} from '#lib/db/services/featureIdentityProposal.js'
import {
  readPublicFeatureSuccessors,
  readSavedFeatureSuccessors,
} from '#lib/db/services/featureSuccessors.js'
import { readFeatureLocationBaseline } from '#lib/db/services/locationBaseline.js'
import {
  commitTaskFeatureReview,
  commitTaskImageReview,
  commitTaskDraftFinalization,
  commitTaskFeatureDraftFinalization,
} from '#lib/db/services/task.js'
import { updateFeatureRevisionState } from '#lib/db/services/featureStateRevision.js'
import {
  createFeatureForm,
  saveUnlinkedFeatureForm,
} from '#lib/db/services/featureFormSave.js'
import { prepareInitialFeatureSubmission } from '#lib/db/services/featureInitialDraft.js'
import { prepareFeatureAcceptedCapture } from '#lib/db/services/featureAcceptedCapture.js'
import { FeatureInsert } from '#lib/db/zod/schema/feature.js'
import {
  buildDescendantPublication,
  featurePublicationEligibility,
} from '#lib/db/services/publication.js'
import { applyFeatureUploadTaskPins } from '#lib/db/services/featureUploadRead.js'
import { task } from '#lib/db/schema/task.js'
import { featureLocation } from '#lib/db/schema/location.js'
import { featureLocationMembership } from '#lib/db/schema/locationRelationships.js'
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '#lib/db/schema/property.js'
// DOMAIN
import {
  FeatureRevisionContentSchema,
  applyFeatureTranslationPatch,
} from '#lib/revisions/featureContent.js'
// SERVICES
import {
  buildFeatureRevisionBaselineContent,
  parseFeatureRevisionSource,
} from '#lib/db/services/featureRevisionContent.js'
import {
  saveFeatureFormRevision,
  buildFeatureFormCandidate,
} from '#lib/db/services/featureFormRevision.js'
import {
  routeFeatureRevisionPublication,
  featureLegacyPublicationGuard,
} from '#lib/db/services/featureRevisionPublication.js'
import { prepareFeaturePropertyCascadeCapture } from '#lib/db/services/featurePropertyRevision.js'
import { readFeaturePublicationChanges } from '#lib/db/services/featureRevisionHistory.js'
import {
  getImagesForFeature,
  updateImageWithFeatureImage,
} from '#lib/db/services/image.js'
import { applyFeatureGalleryPins } from '#lib/db/services/featureGalleryRead.js'
import { readFeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'
import { saveFeatureImageMetadata } from '#lib/db/services/featureImageMetadataRevision.js'
import {
  saveFeatureImageUploadDraft,
  readFeatureUploadAttachmentGrant,
} from '#lib/db/services/featureImageUploadRevision.js'
import { validateFeatureGalleryResult } from '#lib/revisions/featureGalleryReview.js'
import {
  prepareFeatureUploadSubmission,
  prepareFeatureUploadTaskCompletion,
} from '#lib/db/services/featureUploadTasks.js'
import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
import { prepareFeatureEditorialProjection } from '#lib/db/services/featureRevisionProjection.js'
import {
  initializeFeatureRevision,
  createFeatureRevisionProposal,
  submitFeatureRevisionProposal,
  rejectFeatureRevisionProposal,
  unpublishFeatureRevision,
} from '#lib/db/services/featureRevision.js'
import {
  saveFeatureStaffDraft,
  publishFeatureStaffDraft,
} from '#lib/db/services/featureStaffRevision.js'
import {
  acceptFeatureEditorialRevision,
  createFeatureTranslationProposal,
  saveFeatureTranslationProposal,
} from '#lib/db/services/featureEditorialRevision.js'
import {
  executeRevisionBatch,
  prepareRevisionCheck,
} from '#lib/db/services/revisionBatch.js'
// FIXTURES
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import { publicationSqlite } from './fixtures/publicationSqlite'
import {
  featureRevisionSourceFixture,
  featureRevisionLocationFixture,
} from './fixtures/featureRevisionContent'
// TYPES
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Database } from '#lib/types.js'
import type { RevisionValue } from '#lib/revisions/merge.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.sqlite.close()
})
const media = {
  revisions: { photo: 'image-r1', research: 'private-r1' },
  order: ['photo', 'research'],
}
const common = { featureId: 'f', actorId: 'author', guard: sql`1` }
const expectedScope = {
  organisationId: 'org',
  projectId: 'project',
  layerId: 'layer',
  resourceHubId: null,
}

/** Build isolated compatibility tables with real child constraints and revision migrations. */
function fixture(linked = false, catalogueCascades = false) {
  const connection = publicationSqlite({ property }, 100)
  connections.push(connection)
  const { sqlite } = connection
  sqlite.exec(
    'CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,username TEXT,displayUsername TEXT,attribution TEXT)',
  )
  sqlite.exec('PRAGMA foreign_keys=ON')
  sqlite.exec(`CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isPublished INTEGER,isArchived INTEGER);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,isPublished INTEGER,isArchived INTEGER);
    CREATE TABLE layer(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,isPublished INTEGER,isArchived INTEGER);
    INSERT INTO organisation VALUES ('org',NULL,1,0);
    INSERT INTO project VALUES ('project','org',1,0);
    INSERT INTO layer VALUES ('layer','org','project',1,0);`)
  sqlite.exec(
    `ALTER TABLE layer ADD COLUMN historicalSourceLayerId TEXT; ALTER TABLE project ADD COLUMN flags TEXT DEFAULT '{}'; ALTER TABLE organisation ADD COLUMN isHubExclusive INTEGER DEFAULT 0;`,
  )
  const composite: Record<string, string> = {
    featureI18n: ', PRIMARY KEY(featureId,locale)',
    featureProperty:
      ', PRIMARY KEY(featureId,propertyId)' +
      (catalogueCascades
        ? ', FOREIGN KEY(propertyId) REFERENCES property(id) ON DELETE CASCADE, FOREIGN KEY(propertyValueId) REFERENCES propertyValue(id) ON DELETE SET NULL'
        : ''),
    featurePropertyI18n:
      ', PRIMARY KEY(featureId,propertyId,locale), FOREIGN KEY(featureId,propertyId) REFERENCES featureProperty(featureId,propertyId)' +
      (catalogueCascades ? ' ON DELETE CASCADE' : ''),
    featureImage:
      ', PRIMARY KEY(featureId,imageId), FOREIGN KEY(imageId) REFERENCES image(id)',
    featureLocationMembership: ', PRIMARY KEY(featureId,containerLocationId,role)',
  }
  for (const table of [
    feature,
    featureI18n,
    featureProperty,
    featurePropertyI18n,
    featureImage,
    image,
    featureLocation,
    featureLocationMembership,
    property,
    propertyI18n,
    propertyValue,
    propertyValueI18n,
  ]) {
    const name = getTableName(table)
    const columns = Object.values(getTableColumns(table)).map(
      column =>
        `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`,
    )
    sqlite.exec(`CREATE TABLE "${name}" (${columns.join(',')}${composite[name] ?? ''})`)
  }
  const source = featureRevisionSourceFixture()
  if (linked) {
    const accepted = featureRevisionLocationFixture()
    const { associationVersion, acceptedOverrides, memberships, ...references } =
      accepted
    source.location = [
      {
        ...references,
        version: associationVersion,
        overrides: acceptedOverrides,
        featureId: 'f',
        actorId: 'location-reviewer',
      },
    ]
    source.locationMemberships = memberships.map(row => ({ ...row, featureId: 'f' }))
  }
  const seed = (table: SQLiteTable, rows: Record<string, RevisionValue>[]) => {
    const columns = getTableColumns(table)
    for (const row of rows) {
      const keys = Object.keys(row)
      sqlite
        .prepare(
          `INSERT INTO "${getTableName(table)}" (${keys.map(key => `"${columns[key].name}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        )
        .run(
          ...(keys.map(key => {
            const value = row[key]
            return typeof value === 'boolean'
              ? Number(value)
              : value !== null && typeof value === 'object'
                ? JSON.stringify(value)
                : value
          }) as never[]),
        )
    }
  }
  seed(feature, [source.record])
  seed(featureI18n, source.translations)
  seed(property, source.fieldDefinitions)
  seed(propertyI18n, source.fieldTranslations)
  seed(propertyValue, source.fieldOptions)
  seed(propertyValueI18n, source.fieldOptionTranslations)
  seed(featureProperty, source.properties)
  seed(featurePropertyI18n, source.propertyTranslations)
  seed(image, source.images)
  seed(featureImage, source.galleryLinks)
  seed(featureLocation, source.location)
  seed(featureLocationMembership, source.locationMemberships)
  sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0201_task_image_review_context.sql', 'utf8'))
  sqlite.exec(`CREATE TABLE task(id TEXT PRIMARY KEY, featureId TEXT,projectId TEXT,organisationId TEXT,
    contributorId TEXT,isDraft INTEGER,isReviewed INTEGER,modifiedAt TEXT,type TEXT,
    reviewerId TEXT,reviewReason TEXT,reviewOutcome TEXT,reviewAction TEXT,message TEXT,createdAt TEXT);
    CREATE TABLE taskImage(taskId TEXT REFERENCES task(id),imageId TEXT REFERENCES image(id),PRIMARY KEY(taskId,imageId));`)
  sqlite.exec(
    readFileSync('migrations/0184_feature_image_upload_revisions.sql', 'utf8'),
  )
  sqlite.exec(
    "INSERT INTO revisionChangeSet(id,actorId,origin,createdAt) VALUES ('media-baseline','fixture','migration','now')",
  )
  for (const [id, revision] of Object.entries(media.revisions)) {
    sqlite
      .prepare(
        'INSERT INTO imageAssetVersion(id,imageId,storageNamespace,storageKey,contentHash,mediaType,byteSize,changeSetId) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        `asset-${id}`,
        id,
        'local',
        `immutable-${id}`,
        'a'.repeat(64),
        'image/jpeg',
        10,
        'media-baseline',
      )
    sqlite
      .prepare(
        'INSERT INTO imageRevision(id,imageId,assetVersionId,changeSetId,metadata) VALUES (?,?,?,?,?)',
      )
      .run(
        revision,
        id,
        `asset-${id}`,
        'media-baseline',
        '{"version":1,"presentationMode":"contain"}',
      )
  }
  const db = connection.db as unknown as Database
  const capture = async () => {
    const captured = await readFeatureRevisionSource(db, 'f', sql`1`)
    if (!captured) throw new Error('Source missing')
    return captured
  }
  const initialize = async (published = true) => {
    const captured = await capture()
    const content = buildFeatureRevisionBaselineContent(captured.snapshot, media)
    const revisionId = await initializeFeatureRevision(db, {
      ...common,
      content,
      published,
      guard: captured.unchanged,
    })
    if (!revisionId) throw new Error('Baseline failed')
    return { content, revisionId }
  }
  const proposal = async (baseRevisionId: string, content: FeatureRevisionContent) => {
    const created = await createFeatureRevisionProposal(db, {
      ...common,
      baseRevisionId,
      content,
    })
    if (!created) throw new Error('Proposal failed')
    expect(
      await submitFeatureRevisionProposal(db, {
        ...common,
        proposalId: created.proposalId,
        expectedCandidateRevisionId: created.candidateRevisionId,
      }),
    ).toBe(true)
    return created
  }
  const accept = async (
    _previous: FeatureRevisionContent,
    revisionId: string,
    generation: number,
    candidate: Awaited<ReturnType<typeof proposal>>,
  ) => {
    return acceptFeatureEditorialRevision(db, {
      ...common,
      actorId: 'reviewer',
      proposalId: candidate.proposalId,
      expectedCandidateRevisionId: candidate.candidateRevisionId,
      expectedPublishedRevisionId: revisionId,
      expectedGeneration: generation,
      expectedScope,
      validateResult: () => [],
      canReviewPath: () => true,
    })
  }
  return { db, sqlite, source, seed, capture, initialize, proposal, accept }
}

describe('atomic complete Feature editorial projection', () => {
  it('leaves every public source row untouched until acceptance and preserves internal/gallery values', async () => {
    const f = fixture(),
      baseline = await f.initialize(),
      source = await f.capture()
    const candidate = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { en: { title: 'Corrected' } } },
      { locales: ['en'], fields: ['title'] },
    )
    const submitted = await f.proposal(baseline.revisionId, candidate)
    expect(await executeRevisionBatch(f.db, source.unchanged, [])).toEqual([])
    expect(
      (await f.accept(baseline.content, baseline.revisionId, 0, submitted)).status,
    ).toBe('accepted')
    expect(
      f.sqlite
        .prepare(
          "SELECT title,titleGen FROM featureI18n WHERE featureId='f' AND locale='en'",
        )
        .get(),
    ).toEqual({ title: 'Corrected', titleGen: 0 })
    expect(
      f.sqlite
        .prepare(
          "SELECT value,valueGen FROM featurePropertyI18n WHERE propertyId='private'",
        )
        .get(),
    ).toEqual({ value: 'Internal', valueGen: null })
    expect(
      f.sqlite
        .prepare("SELECT isPublished FROM featureImage WHERE imageId='research'")
        .get(),
    ).toEqual({ isPublished: 0 })
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) n FROM featureRevisionImage WHERE featureRevisionId=?',
        )
        .get(submitted.candidateRevisionId),
    ).toEqual({ n: 2 })
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('merges independently submitted locales using the complete current projection', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    const permission = { locales: ['en', 'zh-hant'], fields: ['title'] as const }
    const a = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { en: { title: 'English' } } },
      permission,
    )
    const b = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { 'zh-hant': { title: '中文' } } },
      permission,
    )
    const submittedA = await f.proposal(baseline.revisionId, a),
      submittedB = await f.proposal(baseline.revisionId, b)
    expect(
      (await f.accept(baseline.content, baseline.revisionId, 0, submittedA)).status,
    ).toBe('accepted')
    const result = await f.accept(a, submittedA.candidateRevisionId, 1, submittedB)
    expect(result.status).toBe('accepted')
    expect(
      f.sqlite.prepare('SELECT locale,title FROM featureI18n ORDER BY locale').all(),
    ).toEqual([
      { locale: 'en', title: 'English' },
      { locale: 'zh-hant', title: '中文' },
    ])
    if (result.status === 'accepted')
      expect(
        f.sqlite
          .prepare(
            'SELECT previousRevisionId,mergedFromRevisionId FROM featureRevision WHERE id=?',
          )
          .get(result.revisionId),
      ).toEqual({
        previousRevisionId: submittedA.candidateRevisionId,
        mergedFromRevisionId: submittedB.candidateRevisionId,
      })
  })

  it('replaces full property/locale sets and derives spatial membership without restoring controls', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    const candidate = structuredClone(baseline.content)
    candidate.placement.geometry = { type: 'Point', coordinates: [115, 23] }
    delete candidate.properties.choice
    delete candidate.translations['zh-hant']
    candidate.properties.structured.selection.valueJson = 'null'
    const plan = prepareFeatureEditorialProjection(f.db, {
      featureId: 'f',
      previous: baseline.content,
      content: candidate,
      source: await f.capture(),
    })
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...plan.statements,
        prepareRevisionCheck(f.db, plan.verify),
      ]),
    ).not.toBeNull()
    expect(
      f.sqlite
        .prepare(
          "SELECT organisationId,projectId,layerId,contributorId,publisherId,isPublished,isArchived,isDraft FROM feature WHERE id='f'",
        )
        .get(),
    ).toEqual({
      organisationId: 'org',
      projectId: 'project',
      layerId: 'layer',
      contributorId: 'original-contributor',
      publisherId: 'publisher',
      isPublished: 1,
      isArchived: 0,
      isDraft: 0,
    })
    expect(
      f.sqlite
        .prepare("SELECT valueJson FROM featureProperty WHERE propertyId='structured'")
        .get(),
    ).toEqual({ valueJson: 'null' })
    expect(
      f.sqlite
        .prepare("SELECT count(*) n FROM featureProperty WHERE propertyId='choice'")
        .get(),
    ).toEqual({ n: 0 })
    expect(
      f.sqlite.prepare('SELECT spatialIndex FROM feature').get()?.spatialIndex,
    ).not.toBe('{"cells":[1]}')
    expect(f.sqlite.prepare('SELECT count(*) n FROM property').get()).toEqual({ n: 3 })
  })

  it.each([
    "CREATE TRIGGER fail_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation=1 BEGIN SELECT RAISE(ABORT,'late receipt failure'); END",
    "CREATE TRIGGER skip_translation BEFORE INSERT ON featureI18n WHEN NEW.locale='en' BEGIN SELECT RAISE(IGNORE); END",
    "CREATE TRIGGER unexpected_move AFTER UPDATE OF modifiedAt ON feature BEGIN UPDATE feature SET layerId='other' WHERE id=NEW.id; END",
  ])(
    'rolls back all content, heads and review state after a late failure: %s',
    async trigger => {
      const f = fixture(),
        baseline = await f.initialize()
      const candidate = applyFeatureTranslationPatch(
        baseline.content,
        { translations: { en: { title: 'Rollback' } } },
        { locales: ['en'], fields: ['title'] },
      )
      const submitted = await f.proposal(baseline.revisionId, candidate)
      const source = await f.capture()
      f.sqlite.exec(trigger)
      if (trigger.includes('fail_receipt'))
        await expect(
          f.accept(baseline.content, baseline.revisionId, 0, submitted),
        ).rejects.toThrow()
      else
        expect(
          await f.accept(baseline.content, baseline.revisionId, 0, submitted),
        ).toEqual({ status: 'stale' })
      expect(await executeRevisionBatch(f.db, source.unchanged, [])).toEqual([])
      expect(
        f.sqlite
          .prepare('SELECT publishedRevisionId,generation FROM featureRevisionHead')
          .get(),
      ).toEqual({ publishedRevisionId: baseline.revisionId, generation: 0 })
      expect(
        f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get(),
      ).toEqual({ status: 'submitted' })
    },
  )

  it('refuses a published revision whose child projection already drifted before the read', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    f.sqlite.exec(
      "UPDATE featurePropertyI18n SET value='Unrecorded' WHERE propertyId='private'",
    )
    const candidate = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { en: { title: 'New' } } },
      { locales: ['en'], fields: ['title'] },
    )
    const submitted = await f.proposal(baseline.revisionId, candidate)
    expect(await f.accept(baseline.content, baseline.revisionId, 0, submitted)).toEqual(
      { status: 'stale' },
    )
    expect(
      f.sqlite
        .prepare("SELECT value FROM featurePropertyI18n WHERE propertyId='private'")
        .get(),
    ).toEqual({ value: 'Unrecorded' })
  })

  it('advances the legacy edit fence without firing unrelated geometry/lifecycle writes', async () => {
    const f = fixture()
    f.sqlite.exec("UPDATE feature SET modifiedAt='2099-01-01T00:00:00.000Z'")
    const baseline = await f.initialize()
    f.sqlite.exec(
      "CREATE TRIGGER unrelated_geometry BEFORE UPDATE OF geometry,isVisitable ON feature BEGIN SELECT RAISE(ABORT,'unrelated column touched'); END",
    )
    const content = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { en: { title: 'Future clock' } } },
      { locales: ['en'], fields: ['title'] },
    )
    const submitted = await f.proposal(baseline.revisionId, content)
    expect(
      (await f.accept(baseline.content, baseline.revisionId, 0, submitted)).status,
    ).toBe('accepted')
    expect(
      String(
        f.sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()
          ?.modifiedAt,
      ),
    ).toBe('2099-01-01T00:00:00.002Z')
  })

  it('accepts linked descriptions without changing accepted references or shared corrections', async () => {
    const f = fixture(true),
      baseline = await f.initialize()
    const before = f.sqlite.prepare('SELECT * FROM featureLocation').all()
    const candidate = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { en: { description: 'Local description' } } },
      { locales: ['en'], fields: ['description'] },
    )
    const submitted = await f.proposal(baseline.revisionId, candidate)
    expect(
      (await f.accept(baseline.content, baseline.revisionId, 0, submitted)).status,
    ).toBe('accepted')
    expect(f.sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(before)
    const unsafe = structuredClone(candidate)
    unsafe.translations.en.title.value = 'Implicit shared correction'
    const source = await f.capture()
    expect(() =>
      prepareFeatureEditorialProjection(f.db, {
        featureId: 'f',
        source,
        previous: candidate,
        content: unsafe,
      }),
    ).toThrow('separate Location review')
  })

  it('keeps translation command content private and requires exact draft ownership', async () => {
    const f = fixture(),
      baseline = await f.initialize(),
      before = await f.capture()
    const permission = { locales: ['en'], fields: ['title'] as const }
    const input = { ...common, expectedScope, permission }
    const created = await createFeatureTranslationProposal(f.db, {
      ...input,
      baseRevisionId: baseline.revisionId,
      patch: { translations: { en: { title: 'Draft' } } },
    })
    if (!created) throw new Error('Expected draft')
    expect(Object.keys(created).sort()).toEqual(['candidateRevisionId', 'proposalId'])
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
    expect(
      await saveFeatureTranslationProposal(f.db, {
        ...input,
        actorId: 'another-user',
        proposalId: created.proposalId,
        expectedCandidateRevisionId: created.candidateRevisionId,
        patch: { translations: { en: { title: 'Unauthorized' } } },
      }),
    ).toBeNull()
    const saved = await saveFeatureTranslationProposal(f.db, {
      ...input,
      proposalId: created.proposalId,
      expectedCandidateRevisionId: created.candidateRevisionId,
      patch: { translations: { en: { title: 'Revised draft' } } },
    })
    expect(saved).not.toBeNull()
    expect(
      await createFeatureTranslationProposal(f.db, {
        ...input,
        baseRevisionId: created.candidateRevisionId,
        patch: { translations: { en: { title: 'Private base' } } },
      }),
    ).toBeNull()
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
    const stored = f.sqlite
      .prepare('SELECT content FROM featureRevision WHERE id=?')
      .get(saved)
    const content = FeatureRevisionContentSchema.parse(
      JSON.parse(String(stored?.content)),
    )
    expect(content.properties.private).toEqual(baseline.content.properties.private)
  })

  it.each([
    'UPDATE feature SET isPublished=0',
    'UPDATE feature SET isArchived=1',
    'UPDATE layer SET isPublished=0',
    'UPDATE project SET isArchived=1',
    "UPDATE organisation SET hubId='another-hub'",
  ])(
    'does not reactivate hidden Features or accept through changed ancestry: %s',
    async mutation => {
      const f = fixture(),
        baseline = await f.initialize()
      const submitted = await f.proposal(baseline.revisionId, baseline.content)
      f.sqlite.exec(mutation)
      expect(
        await f.accept(baseline.content, baseline.revisionId, 0, submitted),
      ).toEqual({ status: 'stale' })
      expect(
        await createFeatureTranslationProposal(f.db, {
          ...common,
          expectedScope,
          baseRevisionId: baseline.revisionId,
          permission: { locales: ['en'], fields: ['title'] },
          patch: { translations: { en: { title: 'No' } } },
        }),
      ).toBeNull()
      expect(
        f.sqlite.prepare('SELECT generation FROM featureRevisionHead').get(),
      ).toEqual({ generation: 0 })
    },
  )

  it('applies current result authorization after merging and before any projection writes', async () => {
    const f = fixture(),
      baseline = await f.initialize(),
      before = await f.capture()
    const submitted = await f.proposal(baseline.revisionId, baseline.content)
    expect(
      await acceptFeatureEditorialRevision(f.db, {
        ...common,
        expectedScope,
        ...submitted,
        expectedCandidateRevisionId: submitted.candidateRevisionId,
        expectedPublishedRevisionId: baseline.revisionId,
        expectedGeneration: 0,
        validateResult: () => ['Publishing permission was revoked'],
        canReviewPath: () => true,
      }),
    ).toEqual({ status: 'invalid', errors: ['Publishing permission was revoked'] })
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
    expect(
      f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get(),
    ).toEqual({ status: 'submitted' })
  })

  it('does not return private conflict values to a reviewer without access to that field', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    const first = structuredClone(baseline.content),
      second = structuredClone(baseline.content)
    first.properties.private.translations.en.value = 'Current private text'
    second.properties.private.translations.en.value = 'Proposed private text'
    const a = await f.proposal(baseline.revisionId, first),
      b = await f.proposal(baseline.revisionId, second)
    expect((await f.accept(baseline.content, baseline.revisionId, 0, a)).status).toBe(
      'accepted',
    )
    const result = await acceptFeatureEditorialRevision(f.db, {
      ...common,
      expectedScope,
      proposalId: b.proposalId,
      expectedCandidateRevisionId: b.candidateRevisionId,
      expectedPublishedRevisionId: a.candidateRevisionId,
      expectedGeneration: 1,
      validateResult: () => [],
      canReviewPath: path => path[0] !== 'properties',
    })
    expect(result).toEqual({
      status: 'invalid',
      errors: ['Proposal conflicts include fields outside current review permissions'],
    })
    expect(JSON.stringify(result)).not.toContain('private text')
    expect(
      f.sqlite
        .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
        .get(b.proposalId),
    ).toEqual({ status: 'submitted' })
  })

  it('rejects explicit resolutions for private fields without writing any review state', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    const first = structuredClone(baseline.content),
      second = structuredClone(baseline.content)
    first.properties.private.translations.en.value = 'Current private text'
    second.properties.private.translations.en.value = 'Proposed private text'
    const a = await f.proposal(baseline.revisionId, first),
      b = await f.proposal(baseline.revisionId, second)
    expect((await f.accept(baseline.content, baseline.revisionId, 0, a)).status).toBe(
      'accepted',
    )
    const before = await f.capture()
    const result = await acceptFeatureEditorialRevision(f.db, {
      ...common,
      expectedScope,
      proposalId: b.proposalId,
      expectedCandidateRevisionId: b.candidateRevisionId,
      expectedPublishedRevisionId: a.candidateRevisionId,
      expectedGeneration: 1,
      resolutions: [
        {
          path: ['properties', 'private', 'translations', 'en'],
          result: {
            present: true,
            value: { value: 'Chosen private text', valueGen: false },
          },
        },
      ],
      validateResult: () => [],
      canReviewPath: path => path[0] !== 'properties',
    })
    expect(result).toEqual({
      status: 'invalid',
      errors: [
        'Conflict resolution includes fields outside current review permissions',
      ],
    })
    expect(JSON.stringify(result)).not.toContain('private text')
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
    expect(
      f.sqlite
        .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
        .get(b.proposalId),
    ).toEqual({ status: 'submitted' })
    expect(
      f.sqlite
        .prepare('SELECT publishedRevisionId,generation FROM featureRevisionHead')
        .get(),
    ).toEqual({
      publishedRevisionId: a.candidateRevisionId,
      generation: 1,
    })
  })

  it('publishes gallery order, captions and metadata pins atomically without changing image identity', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    f.sqlite.exec(`INSERT INTO imageRevision(id,imageId,previousRevisionId,assetVersionId,changeSetId,metadata)
      VALUES ('image-r2','photo','image-r1','asset-photo','media-baseline','{"credit":"Corrected"}')`)
    const content = structuredClone(baseline.content)
    content.gallery.order.reverse()
    content.gallery.entries.photo.imageRevisionId = 'image-r2'
    content.gallery.entries.photo.caption.en = 'Reviewed caption'
    content.gallery.entries.photo.alt.en = 'Accessible description'
    const submitted = await f.proposal(baseline.revisionId, content)
    expect(
      f.sqlite
        .prepare(
          "SELECT imageRevisionId FROM featureRevisionImage WHERE featureRevisionId=? AND imageId='photo'",
        )
        .get(baseline.revisionId),
    ).toEqual({ imageRevisionId: 'image-r1' })
    const result = await acceptFeatureEditorialRevision(f.db, {
      ...common,
      expectedScope,
      ...submitted,
      expectedCandidateRevisionId: submitted.candidateRevisionId,
      expectedPublishedRevisionId: baseline.revisionId,
      expectedGeneration: 0,
      validateResult: () => [],
      canReviewPath: () => true,
    })
    expect(result.status).toBe('accepted')
    expect(
      f.sqlite
        .prepare(
          'SELECT imageId,position,imageRevisionId FROM featureRevisionImage WHERE featureRevisionId=? ORDER BY position',
        )
        .all(submitted.candidateRevisionId),
    ).toEqual([
      { imageId: 'research', position: 0, imageRevisionId: 'private-r1' },
      { imageId: 'photo', position: 1, imageRevisionId: 'image-r2' },
    ])
    expect(f.sqlite.prepare('SELECT count(*) AS n FROM image').get()).toEqual({ n: 2 })
    expect(
      f.sqlite
        .prepare("SELECT isPublished FROM featureImage WHERE imageId='research'")
        .get(),
    ).toEqual({ isPublished: 0 })
  })

  it('detaches gallery entries while retaining old pins and asset records', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    const content = structuredClone(baseline.content)
    delete content.gallery.entries.photo
    content.gallery.order = ['research']
    const submitted = await f.proposal(baseline.revisionId, content)
    expect(
      (
        await acceptFeatureEditorialRevision(f.db, {
          ...common,
          expectedScope,
          ...submitted,
          expectedCandidateRevisionId: submitted.candidateRevisionId,
          expectedPublishedRevisionId: baseline.revisionId,
          expectedGeneration: 0,
          validateResult: () => [],
          canReviewPath: () => true,
        })
      ).status,
    ).toBe('accepted')
    expect(f.sqlite.prepare('SELECT imageId FROM featureImage').all()).toEqual([
      { imageId: 'research' },
    ])
    expect(
      f.sqlite.prepare('SELECT count(*) AS n FROM imageAssetVersion').get(),
    ).toEqual({ n: 2 })
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) AS n FROM featureRevisionImage WHERE featureRevisionId=?',
        )
        .get(baseline.revisionId),
    ).toEqual({ n: 2 })
  })

  it('rolls back gallery removal with a failed publication receipt', async () => {
    const f = fixture(),
      baseline = await f.initialize(),
      before = await f.capture()
    const content = structuredClone(baseline.content)
    content.gallery = { entries: {}, order: [] }
    const submitted = await f.proposal(baseline.revisionId, content)
    f.sqlite.exec(
      "CREATE TRIGGER fail_gallery_receipt BEFORE INSERT ON featureRevisionPublication BEGIN SELECT RAISE(ABORT,'gallery receipt failure'); END",
    )
    await expect(
      acceptFeatureEditorialRevision(f.db, {
        ...common,
        expectedScope,
        ...submitted,
        expectedCandidateRevisionId: submitted.candidateRevisionId,
        expectedPublishedRevisionId: baseline.revisionId,
        expectedGeneration: 0,
        validateResult: () => [],
        canReviewPath: () => true,
      }),
    ).rejects.toThrow()
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
    expect(
      f.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get(),
    ).toEqual({ publishedRevisionId: baseline.revisionId })
  })

  it('keeps staff Save separate from first Publish and rejects foreign draft publication', async () => {
    const f = fixture()
    f.sqlite.exec(
      "UPDATE feature SET isPublished=0,localIsPublished=0,isDraft=1 WHERE id='f'",
    )
    const baseline = await f.initialize(false),
      before = await f.capture()
    const content = structuredClone(baseline.content)
    content.translations.en.title.value = 'Staff draft'
    const draft = required(
      await saveFeatureStaffDraft(f.db, {
        ...common,
        expectedScope,
        baseRevisionId: baseline.revisionId,
        content,
        validateResult: () => [],
      }),
    )
    expect(draft).not.toBeNull()
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
    const input = {
      ...common,
      expectedScope,
      ...draft,
      expectedCandidateRevisionId: draft.candidateRevisionId,
      expectedComparisonRevisionId: baseline.revisionId,
      expectedPublishedRevisionId: null,
      expectedGeneration: 0,
      validateResult: () => [],
      canReviewPath: () => true,
    }
    expect(
      await publishFeatureStaffDraft(f.db, { ...input, actorId: 'another-editor' }),
    ).toEqual({ status: 'stale' })
    expect((await publishFeatureStaffDraft(f.db, input)).status).toBe('accepted')
    expect(
      f.sqlite.prepare("SELECT title FROM featureI18n WHERE locale='en'").get(),
    ).toEqual({ title: 'Staff draft' })
    expect(f.sqlite.prepare('SELECT isPublished,isDraft FROM feature').get()).toEqual({
      isPublished: 1,
      isDraft: 0,
    })
  })

  it('requires explicit staff republication against the last accepted revision', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    expect(
      await unpublishFeatureRevision(f.db, {
        ...common,
        expectedPublishedRevisionId: baseline.revisionId,
        expectedGeneration: 0,
        projection: { statements: [], verify: sql`1` },
      }),
    ).toBe(true)
    const content = structuredClone(baseline.content)
    content.translations.en.title.value = 'Republished staff draft'
    const draft = required(
      await saveFeatureStaffDraft(f.db, {
        ...common,
        expectedScope,
        baseRevisionId: baseline.revisionId,
        content,
        validateResult: () => [],
      }),
    )
    const input = {
      ...common,
      expectedScope,
      ...draft,
      expectedCandidateRevisionId: draft.candidateRevisionId,
      expectedComparisonRevisionId: baseline.revisionId,
      expectedPublishedRevisionId: null,
      expectedGeneration: 1,
      validateResult: () => [],
      canReviewPath: () => true,
    }
    expect(
      await publishFeatureStaffDraft(f.db, {
        ...input,
        expectedComparisonRevisionId: draft.candidateRevisionId,
      }),
    ).toEqual({ status: 'stale' })
    expect((await publishFeatureStaffDraft(f.db, input)).status).toBe('accepted')
    expect(
      f.sqlite
        .prepare(
          "SELECT comparedRevisionId FROM featureRevisionReview WHERE action='accepted'",
        )
        .get(),
    ).toEqual({ comparedRevisionId: baseline.revisionId })
  })

  it('leaves a staff draft editable when its explicit publication fails late', async () => {
    const f = fixture(),
      baseline = await f.initialize(),
      before = await f.capture()
    const draft = required(
      await saveFeatureStaffDraft(f.db, {
        ...common,
        expectedScope,
        baseRevisionId: baseline.revisionId,
        content: baseline.content,
        validateResult: () => [],
      }),
    )
    f.sqlite.exec(
      "CREATE TRIGGER fail_staff_publish BEFORE INSERT ON featureRevisionPublication BEGIN SELECT RAISE(ABORT,'staff publication failure'); END",
    )
    await expect(
      publishFeatureStaffDraft(f.db, {
        ...common,
        expectedScope,
        ...draft,
        expectedCandidateRevisionId: draft.candidateRevisionId,
        expectedComparisonRevisionId: baseline.revisionId,
        expectedPublishedRevisionId: baseline.revisionId,
        expectedGeneration: 0,
        validateResult: () => [],
        canReviewPath: () => true,
      }),
    ).rejects.toThrow()
    expect(
      f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get(),
    ).toEqual({ status: 'draft' })
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
  })

  it('refuses reference drift and cross-field classifier assignments', async () => {
    const f = fixture(true),
      baseline = await f.initialize()
    f.sqlite.exec(
      "UPDATE featureLocation SET factsRevisionId='unrecorded' WHERE featureId='f'",
    )
    const candidate = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { en: { description: 'New' } } },
      { locales: ['en'], fields: ['description'] },
    )
    const submitted = await f.proposal(baseline.revisionId, candidate)
    expect(await f.accept(baseline.content, baseline.revisionId, 0, submitted)).toEqual(
      { status: 'stale' },
    )
    const u = fixture(),
      unlinked = await u.initialize()
    u.sqlite.exec("UPDATE propertyValue SET propertyId='private' WHERE id='option'")
    const edit = await u.proposal(unlinked.revisionId, unlinked.content)
    expect(await u.accept(unlinked.content, unlinked.revisionId, 0, edit)).toEqual({
      status: 'stale',
    })
  })

  it('compares JSON semantically and keeps all statement bindings bounded', async () => {
    const f = fixture()
    f.sqlite.exec(
      'UPDATE feature SET geometry=\'{"coordinates":[114,22],"type":"Point"}\'',
    )
    for (let index = 0; index < 150; index++) {
      f.seed(property, [{ ...f.source.fieldDefinitions[1], id: `p${index}` }])
      f.seed(featureProperty, [
        {
          featureId: 'f',
          propertyId: `p${index}`,
          propertyValueId: null,
          value: `${index}`,
          valueJson: null,
        },
      ])
    }
    const baseline = await f.initialize(),
      source = await f.capture()
    const candidate = applyFeatureTranslationPatch(
      baseline.content,
      { translations: { en: { title: 'Many fields' } } },
      { locales: ['en'], fields: ['title'] },
    )
    const plan = prepareFeatureEditorialProjection(f.db, {
      featureId: 'f',
      source,
      previous: baseline.content,
      content: candidate,
    })
    for (const statement of [
      ...plan.statements,
      prepareRevisionCheck(f.db, plan.verify),
    ]) {
      const query = statement as unknown as { toSQL: () => { params: unknown[] } }
      expect(query.toSQL().params.length).toBeLessThanOrEqual(100)
    }
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...plan.statements,
        prepareRevisionCheck(f.db, plan.verify),
      ]),
    ).not.toBeNull()
  })
})

describe('existing form revision routing', () => {
  function form(content: FeatureRevisionContent) {
    return {
      organisationId: 'org',
      projectId: 'project',
      layerId: 'layer',
      geometry: content.placement.geometry,
      addressMeta: content.placement.addressMeta,
      isIntangible: content.profile.isIntangible,
      isVisitable: content.profile.visitability.isVisitable,
      isPendingReview: false,
      isDraft: false,
      i18n: {
        en: {
          title: 'Saved form title',
          titleGen: false,
          descriptionGen: false,
          displayAddressGen: false,
        },
      },
      properties: Object.entries(content.properties)
        .filter(([id]) => id !== 'private')
        .map(([propertyId, row]) => ({
          propertyId,
          value: row.selection.value,
          valueJson: row.selection.valueJson,
          propertyValueId: row.selection.propertyValueId,
        })),
    } as unknown as Required<
      Pick<Parameters<typeof buildFeatureFormCandidate>[2], 'i18n' | 'properties'>
    > &
      Parameters<typeof buildFeatureFormCandidate>[2]
  }

  it('retains omitted Feature fields and placement while applying a profile translation', async () => {
    const f = fixture()
    const initial = await f.initialize()
    const source = await f.capture()
    const result = buildFeatureFormCandidate(initial.content, source.snapshot, {
      i18n: {
        en: {
          title: 'Only title',
          titleGen: false,
          descriptionGen: false,
          displayAddressGen: false,
        },
      },
    })
    expect(result.properties).toEqual(initial.content.properties)
    expect(result.placement).toEqual(initial.content.placement)
    expect(result.profile.isIntangible).toBe(initial.content.profile.isIntangible)
    expect(result.profile.visitability).toEqual(initial.content.profile.visitability)
    expect(result.translations.en.title.value).toBe('Only title')
    const cleared = buildFeatureFormCandidate(initial.content, source.snapshot, {
      properties: [],
    })
    expect(
      Object.keys(cleared.properties).filter(
        id => cleared.properties[id].selection.definition.audience !== 'internal',
      ),
    ).toEqual([])
  })
  it('updates authored name bases while retaining the pinned naming rule and overrides', async () => {
    const f = fixture()
    const initial = await f.initialize()
    const source = await f.capture()
    const template = {
      rule: { base: 'feature' as const, conditions: [] },
      baseNames: { en: 'Original' },
      overrides: { 'zh-Hant': '自訂名稱' },
    }
    const previous = {
      ...initial.content,
      profile: { ...initial.content.profile, nameTemplate: template },
    }
    const result = buildFeatureFormCandidate(
      previous,
      source.snapshot,
      form(previous),
      true,
    )
    expect(result.profile.nameTemplate).toEqual({ rule: template.rule })
    expect(result.translations.en.title.value).toBe('Saved form title')
  })
  it.each([null, '', '[]', undefined])(
    'preserves a stored empty phone when the form submits %s',
    async value => {
      const f = fixture()
      f.sqlite.exec(
        "UPDATE property SET component='PhoneField', audience='public' WHERE id='private'",
      )
      f.sqlite.exec(
        "UPDATE featureProperty SET value='[]', valueJson=NULL, propertyValueId=NULL WHERE propertyId='private'",
      )
      f.sqlite.exec("DELETE FROM featurePropertyI18n WHERE propertyId='private'")
      const initial = await f.initialize()
      const source = await f.capture()
      const data = form(initial.content)
      if (value !== undefined)
        data.properties!.push({ propertyId: 'private', value } as never)
      const result = buildFeatureFormCandidate(
        initial.content,
        source.snapshot,
        data,
        true,
      )
      expect(result.properties.private).toEqual(initial.content.properties.private)
      data.properties = [
        ...(data.properties ?? []).filter(row => row.propertyId !== 'private'),
        { propertyId: 'private', value: '["+85221234567"]' } as never,
      ]
      const changed = buildFeatureFormCandidate(
        initial.content,
        source.snapshot,
        data,
        true,
      )
      expect(changed.properties.private.selection.value).toBe('["+85221234567"]')
    },
  )
  it('rolls back the form when the destination layer has left the authorized project', async () => {
    const f = fixture(),
      initial = await f.initialize()
    f.sqlite.exec(
      "INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived) VALUES ('destination','org','other-project',1,0)",
    )
    await expect(
      saveFeatureFormRevision(f.db, {
        ...common,
        guard: buildFeatureCommandScopeGuard(f.db, common.featureId, expectedScope),
        expectedScope,
        updatedAt: 'token',
        data: { ...form(initial.content), layerId: 'destination' },
        canPublish: true,
        allowDescriptions: true,
        allowedInternalIds: new Set(),
      }),
    ).rejects.toThrow('changed')
    expect(
      f.sqlite
        .prepare('SELECT layerId, modifiedAt FROM feature WHERE id=?')
        .get(common.featureId),
    ).toMatchObject({ layerId: 'layer', modifiedAt: 'token' })
  })
  it('saves same-project layer reassignment with the staff revision', async () => {
    const f = fixture(),
      initial = await f.initialize()
    f.sqlite.exec(
      "INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived) VALUES ('destination','org','project',1,0)",
    )
    const saved = await saveFeatureFormRevision(f.db, {
      ...common,
      guard: buildFeatureCommandScopeGuard(f.db, common.featureId, expectedScope),
      expectedScope,
      updatedAt: 'token',
      data: { ...form(initial.content), layerId: 'destination' },
      canPublish: true,
      allowDescriptions: true,
      allowedInternalIds: new Set(),
    })
    expect(saved.status).toBe('applied')
    expect(
      f.sqlite.prepare('SELECT layerId FROM feature WHERE id=?').get(common.featureId),
    ).toMatchObject({ layerId: 'destination' })
  })
  it('applies staff form changes directly while preserving hidden content and visibility', async () => {
    const f = fixture(),
      initial = await f.initialize()
    f.sqlite.exec(
      "INSERT INTO user(id,name,username,displayUsername) VALUES ('author','History Author','history.author','History.Author')",
    )
    const saved = await saveFeatureFormRevision(f.db, {
      ...common,
      guard: buildFeatureCommandScopeGuard(f.db, common.featureId, expectedScope),
      expectedScope,
      updatedAt: 'token',
      data: { ...form(initial.content), isVisitable: false },
      canPublish: true,
      allowDescriptions: true,
      allowedInternalIds: new Set(),
    })
    expect(saved.status).toBe('applied')
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      ...common,
      canPublish: true,
    })
    expect(workspace.proposals).toHaveLength(0)
    expect(workspace.history[0]).toMatchObject({
      actorId: 'author',
      actorUsername: 'history.author',
      actorDisplayUsername: 'History.Author',
    })
    const candidate = FeatureRevisionContentSchema.parse(
      JSON.parse(
        (
          f.sqlite
            .prepare('SELECT content FROM featureRevision WHERE id=?')
            .get(workspace.comparisonRevisionId) as { content: string }
        ).content,
      ),
    )
    expect(candidate.properties.private).toEqual(initial.content.properties.private)
    expect(candidate.translations['zh-hant']).toEqual(
      initial.content.translations['zh-hant'],
    )
    expect(candidate.gallery).toEqual(initial.content.gallery)
    expect(
      f.sqlite
        .prepare("SELECT isVisitable,isPublished FROM feature WHERE id='f'")
        .get(),
    ).toEqual({ isVisitable: 0, isPublished: 1 })
  })
  it('saves an unpublished staff record directly and publishes its latest accepted content', async () => {
    const f = fixture()
    f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    f.sqlite.exec("UPDATE feature SET isPublished=0,localIsPublished=0 WHERE id='f'")
    const initial = await f.initialize(false)
    f.sqlite.exec(
      "INSERT INTO user(id,name,username,displayUsername) VALUES ('author','History Author','history.author','History.Author')",
    )
    const saved = await saveFeatureFormRevision(f.db, {
      ...common,
      guard: buildFeatureCommandScopeGuard(f.db, common.featureId, expectedScope),
      expectedScope,
      updatedAt: 'token',
      data: { ...form(initial.content), isVisitable: false },
      canPublish: true,
      allowDescriptions: true,
      allowedInternalIds: new Set(),
    })
    expect(saved.status).toBe('applied')
    expect(
      f.sqlite
        .prepare("SELECT isVisitable,isPublished FROM feature WHERE id='f'")
        .get(),
    ).toEqual({ isVisitable: 0, isPublished: 0 })
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      ...common,
      canPublish: true,
    })
    expect(workspace.proposals).toHaveLength(0)
    expect(workspace.privateHistory[0]).toMatchObject({
      actorId: 'author',
      actorUsername: 'history.author',
      actorDisplayUsername: 'History.Author',
    })
    expect(workspace.publishedRevisionId).toBeNull()
    expect(
      await routeFeatureRevisionPublication(f.db, { ...common, state: true }),
    ).toBe('updated')
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId FROM featureRevisionHead WHERE featureId='f'",
        )
        .get(),
    ).toEqual({ publishedRevisionId: workspace.comparisonRevisionId })
  })
  it.each([true, false])(
    'saves translation-only staff edits immediately (published=%s)',
    async published => {
      const f = fixture()
      f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
      if (!published)
        f.sqlite.exec(
          "UPDATE feature SET isPublished=0,localIsPublished=0 WHERE id='f'",
        )
      const initial = await f.initialize(published)
      const data = form(initial.content)
      data.i18n.en.title = 'Staff translation'
      const saved = await saveFeatureFormRevision(f.db, {
        ...common,
        expectedScope,
        updatedAt: 'token',
        data,
        canPublish: false,
        allowDescriptions: true,
        allowedInternalIds: new Set(),
      })
      expect(saved.status).toBe('applied')
      expect(
        f.sqlite
          .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
          .get()?.title,
      ).toBe('Staff translation')
      expect(
        f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get()
          ?.isPublished,
      ).toBe(Number(published))
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
      ).toBe(0)
    },
  )
  it('rolls direct staff changes back if the history receipt fails', async () => {
    const f = fixture(),
      initial = await f.initialize()
    const before = (await f.capture()).snapshot
    f.sqlite.exec(
      "CREATE TRIGGER fail_form_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 BEGIN SELECT RAISE(ABORT,'form receipt failed'); END",
    )
    await expect(
      saveFeatureFormRevision(f.db, {
        ...common,
        expectedScope,
        updatedAt: 'token',
        data: form(initial.content),
        canPublish: true,
        allowDescriptions: true,
        allowedInternalIds: new Set(),
      }),
    ).rejects.toThrow()
    expect((await f.capture()).snapshot).toEqual(before)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get(),
    ).toEqual({ n: 0 })
  })
  it('rejects stale form saves and contributors changing profile fields', async () => {
    const f = fixture(),
      initial = await f.initialize()
    const input = {
      ...common,
      expectedScope,
      updatedAt: 'old-token',
      data: form(initial.content),
      canPublish: true,
      allowDescriptions: true,
      allowedInternalIds: new Set<string>(),
    }
    await expect(saveFeatureFormRevision(f.db, input)).rejects.toThrow('changed')
    await expect(
      saveFeatureFormRevision(f.db, {
        ...input,
        updatedAt: 'token',
        canPublish: false,
        data: { ...input.data, isVisitable: false },
      }),
    ).rejects.toThrow('outside')
    expect(
      f.sqlite.prepare('SELECT count(*) AS n FROM featureRevisionProposal').get(),
    ).toEqual({ n: 0 })
  })
  it('never invokes shared Location changes through a draft', async () => {
    const f = fixture(true),
      initial = await f.initialize()
    await expect(
      saveFeatureFormRevision(f.db, {
        ...common,
        expectedScope,
        updatedAt: 'token',
        data: form(initial.content),
        canPublish: true,
        allowDescriptions: true,
        allowedInternalIds: new Set(),
      }),
    ).rejects.toThrow('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
  })
})

describe('accepted gallery read projection', () => {
  it('records existing intent and visibility commands with canonical replacement atomically', async () => {
    const f = fixture(),
      initial = await f.initialize()
    await updateImageWithFeatureImage(
      f.db,
      {},
      { featureId: 'f', intent: 'canonical', isPublished: true },
      'research',
      undefined,
      undefined,
      'gallery-editor',
    )
    const row = required(
      f.sqlite
        .prepare(
          'SELECT r.content,r.previousRevisionId,c.actorId FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId',
        )
        .get(),
    )
    const content = JSON.parse(String(row.content))
    expect(row.previousRevisionId).toBe(initial.revisionId)
    expect(row.actorId).toBe('gallery-editor')
    expect(content.gallery.entries.photo.intent).toBe('general')
    expect(content.gallery.entries.research).toMatchObject({
      intent: 'canonical',
      isPublished: true,
      imageRevisionId: 'private-r1',
    })
    expect(
      f.sqlite
        .prepare("SELECT localIsPublished FROM featureImage WHERE imageId='research'")
        .get()?.localIsPublished,
    ).toBe(1)
    expect(content.gallery.order).toEqual(initial.content.gallery.order)
  })
  it('rolls existing image commands back when their Feature history cannot be recorded', async () => {
    const f = fixture(),
      initial = await f.initialize()
    f.sqlite.exec(
      "CREATE TRIGGER fail_image_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 BEGIN SELECT RAISE(ABORT,'image receipt failed'); END",
    )
    await expect(
      updateImageWithFeatureImage(
        f.db,
        {},
        { featureId: 'f', intent: 'canonical', isPublished: true },
        'research',
        undefined,
        undefined,
        'gallery-editor',
      ),
    ).rejects.toThrow()
    expect(
      f.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get()
        ?.publishedRevisionId,
    ).toBe(initial.revisionId)
    expect(
      f.sqlite
        .prepare("SELECT intent,isPublished FROM featureImage WHERE imageId='research'")
        .get(),
    ).toEqual({ intent: 'research', isPublished: 0 })
    expect(
      f.sqlite.prepare("SELECT intent FROM featureImage WHERE imageId='photo'").get()
        ?.intent,
    ).toBe('canonical')
  })
  it('pins immutable media and order, preserves live filtering, and leaves legacy rows untouched', async () => {
    const f = fixture(),
      initial = await f.initialize()
    const rows = [
      {
        id: 'f',
        images: [
          {
            imageId: 'research',
            isPublished: false,
            image: { id: 'research', publicId: 'wrong' },
          },
          {
            imageId: 'photo',
            isPublished: true,
            image: { id: 'photo', publicId: 'mutable-new', version: 99 },
          },
        ],
      },
      { id: 'legacy', images: [] },
    ]
    const result = await applyFeatureGalleryPins(f.db, rows)
    expect(result[0].images.map(link => link.imageId)).toEqual(
      initial.content.gallery.order,
    )
    expect(result[0].images[0].image).toMatchObject({
      publicId: 'immutable-photo',
      version: 1,
      imageRevisionId: 'image-r1',
      galleryPosition: 0,
    })
    expect(result[1]).toBe(rows[1])
    expect(
      (
        await applyFeatureGalleryPins(f.db, rows, { publishedOnly: true })
      )[0].images.map(link => link.imageId),
    ).toEqual(['photo'])
    f.sqlite.exec("UPDATE image SET isArchived=1 WHERE id='photo'")
    expect(
      (await applyFeatureGalleryPins(f.db, rows))[0].images.map(link => link.imageId),
    ).toEqual(['research'])
    expect(
      (await applyFeatureGalleryPins(f.db, [{ id: 'f', images: [] }]))[0].images,
    ).toEqual([])
  })
  it('returns retained accepted gallery pins through the admin list for an unpublished Feature', async () => {
    const f = fixture()
    await f.initialize(false)
    // Parent publication suppresses delivery without changing the accepted photo intention.
    f.sqlite.exec("UPDATE featureImage SET isPublished=0 WHERE featureId='f'")
    const rows = await getImagesForFeature(f.db, [sql`featureImage.featureId='f'`], {
      limit: 10,
    })
    expect(rows.map(row => row.id)).toEqual(['photo', 'research'])
    expect(rows[0]).toMatchObject({
      imageRevisionId: 'image-r1',
      publicId: 'immutable-photo',
      isPublished: true,
    })
    expect(
      await getImagesForFeature(
        f.db,
        [sql`featureImage.featureId='f'`],
        undefined,
        undefined,
        true,
      ),
    ).toEqual([])
  })
  it('returns no public gallery for an unpublished revision head', async () => {
    const f = fixture()
    await f.initialize(false)
    const rows = [{ id: 'f', images: [{ imageId: 'photo', image: {} }] }]
    expect(
      (await applyFeatureGalleryPins(f.db, rows, { publishedOnly: true }))[0].images,
    ).toEqual([])
    expect(
      (await applyFeatureGalleryPins(f.db, rows, { publishedOnly: false }))[0].images,
    ).toHaveLength(1)
  })
  it.each([true, null])(
    'previews parent-suppressed photos with local intent %s without publishing the head',
    async localIsPublished => {
      const f = fixture()
      await f.initialize(false)
      f.sqlite.exec("UPDATE feature SET isPublished=0 WHERE id='f'")
      const rows = [
        {
          id: 'f',
          images: [
            {
              imageId: 'photo',
              isPublished: false,
              localIsPublished,
              image: { publicId: 'mutable' },
            },
            { imageId: 'research', isPublished: false, image: { publicId: 'private' } },
          ],
        },
      ]
      const result = await applyFeatureGalleryPins(f.db, rows, {
        publishedOnly: true,
        publicationPreview: true,
      })
      expect(result[0].images.map(link => link.imageId)).toEqual(['photo'])
      expect(result[0].images[0].isPublished).toBe(true)
      expect(result[0].images[0].image).toMatchObject({
        publicId: 'immutable-photo',
        imageRevisionId: 'image-r1',
      })
      expect(
        (await applyFeatureGalleryPins(f.db, rows, { publishedOnly: true }))[0].images,
      ).toEqual([])
      expect(
        f.sqlite
          .prepare(
            "SELECT publishedRevisionId FROM featureRevisionHead WHERE featureId='f'",
          )
          .get()?.publishedRevisionId,
      ).toBeNull()
      // An explicit photo-level suppression must not be restored by preview.
      rows[0].images[0].localIsPublished = false
      expect(
        (
          await applyFeatureGalleryPins(f.db, rows, {
            publishedOnly: true,
            publicationPreview: true,
          })
        )[0].images,
      ).toEqual([])
      expect(
        f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get()
          ?.isPublished,
      ).toBe(0)
    },
  )
})

describe('revision publication controls and workspace privacy', () => {
  const upload = {
    ...common,
    storageNamespace: 'local' as const,
    storageKey: 'new-immutable-key',
    mediaType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    taskIds: [] as string[],
    draftContributor: false,
    intent: 'general' as const,
    deriveMetadata: () => ({ version: 2, presentationMode: 'contain' as const }),
  }
  it('adds staff uploads directly to the accepted gallery and replays the original receipt', async () => {
    const f = fixture()
    await f.initialize()
    const saved = await saveFeatureImageUploadDraft(f.db, upload)
    if (saved.status !== 'accepted') throw new Error('Expected accepted upload')
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureImage').get()?.n).toBe(3)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
    ).toBe(0)
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      ...common,
      canPublish: true,
    })
    expect(workspace.comparisonRevisionId).toBe(saved.revisionId)
    expect(await saveFeatureImageUploadDraft(f.db, upload)).toEqual({
      ...saved,
      replayed: true,
    })
    await expect(
      saveFeatureImageUploadDraft(f.db, {
        ...upload,
        bytes: new Uint8Array([4]).buffer,
      }),
    ).rejects.toThrow('differs')
  })
  it('adds staff photos to an unpublished Feature without exposing the Feature', async () => {
    const f = fixture()
    f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    f.sqlite.exec("UPDATE feature SET isPublished=0,localIsPublished=0 WHERE id='f'")
    await f.initialize(false)
    const saved = await saveFeatureImageUploadDraft(f.db, upload)
    if (saved.status !== 'accepted') throw new Error('Expected accepted upload')
    expect(
      f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get()
        ?.isPublished,
    ).toBe(0)
    expect(
      f.sqlite
        .prepare(
          'SELECT isPublished,localIsPublished FROM featureImage WHERE imageId=?',
        )
        .get(saved.imageId),
    ).toEqual({ isPublished: 0, localIsPublished: 1 })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
    ).toBe(0)
    expect(await saveFeatureImageUploadDraft(f.db, upload)).toEqual({
      ...saved,
      replayed: true,
    })
  })
  it('accepts staff research photos without publishing them', async () => {
    const f = fixture()
    await f.initialize()
    const saved = await saveFeatureImageUploadDraft(f.db, {
      ...upload,
      intent: 'research',
    })
    if (saved.status !== 'accepted') throw new Error('Expected accepted upload')
    expect(
      f.sqlite
        .prepare('SELECT intent,isPublished FROM featureImage WHERE imageId=?')
        .get(saved.imageId),
    ).toEqual({ intent: 'research', isPublished: 0 })
  })
  it('keeps missing-report evidence private and preserves the existing canonical image', async () => {
    const f = fixture()
    await f.initialize()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('missing','f','project','org','author',1,0,'2026-01-01','reportedMissing')",
    )
    const saved = await saveFeatureImageUploadDraft(f.db, {
      ...upload,
      taskIds: ['missing'],
      intent: 'canonical',
      draftContributor: true,
    })
    if (saved.status !== 'saved') throw new Error('Expected research draft')
    const content = JSON.parse(
      String(
        required(
          f.sqlite
            .prepare('SELECT content FROM featureRevision WHERE id=?')
            .get(saved.candidateRevisionId),
        ).content,
      ),
    )
    expect(content.gallery.entries[saved.imageId]).toMatchObject({
      intent: 'research',
      isPublished: false,
    })
    expect(content.gallery.entries.photo.intent).toBe('canonical')
    expect(
      f.sqlite
        .prepare('SELECT count(*) n FROM featureImage WHERE imageId=?')
        .get(saved.imageId)?.n,
    ).toBe(0)
  })
  it('pins submitted task evidence to its original upload and preserves caller filtering', async () => {
    const f = fixture()
    await f.initialize()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('t','f','project','org','author',1,0,'task-token','newPhoto')",
    )
    const saved = await saveFeatureImageUploadDraft(f.db, {
      ...upload,
      taskIds: ['t'],
      draftContributor: true,
    })
    if (saved.status !== 'saved') throw new Error('Expected upload')
    f.sqlite
      .prepare('UPDATE image SET publicId=? WHERE id=?')
      .run('mutable-key', saved.imageId)
    const rows = [
      { id: saved.imageId, taskId: 't', featureId: 'f', publicId: 'mutable-key' },
    ]
    expect((await applyFeatureUploadTaskPins(f.db, rows))[0]).toMatchObject({
      imageRevisionId: saved.imageRevisionId,
      publicId: upload.storageKey,
    })
    expect(await applyFeatureUploadTaskPins(f.db, [])).toEqual([])
    f.sqlite.exec("UPDATE task SET projectId='elsewhere' WHERE id='t'")
    expect(await applyFeatureUploadTaskPins(f.db, rows)).toEqual(rows)
  })
  it('resolves simultaneous upload confirmations to one immutable receipt', async () => {
    const f = fixture()
    await f.initialize()
    const results = await Promise.all([
      saveFeatureImageUploadDraft(f.db, upload),
      saveFeatureImageUploadDraft(f.db, upload),
    ])
    // Either concurrent caller can win; both must receive the same immutable receipt.
    expect(results.map(result => result.status)).toEqual(['accepted', 'accepted'])
    const receipts = results.map(result => {
      if (result.status !== 'accepted') throw new Error('Expected accepted upload')
      const { replayed, ...receipt } = result
      return { replayed, receipt }
    })
    expect(receipts.map(result => result.replayed).sort()).toEqual([false, true])
    expect(receipts[0].receipt).toEqual(receipts[1].receipt)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureImageUploadRevision').get()?.n,
    ).toBe(0)
  })
  it('accepts replacement pixels under the same image identity and rejects a stale displayed pin', async () => {
    const f = fixture()
    await f.initialize()
    const before = (await f.capture()).snapshot
    const replacement = { imageId: 'photo', imageRevisionId: 'image-r1' }
    const saved = await saveFeatureImageUploadDraft(f.db, { ...upload, replacement })
    if (saved.status !== 'accepted') throw new Error('Expected accepted replacement')
    expect(saved.imageId).toBe('photo')
    expect((await f.capture()).snapshot).not.toEqual(before)
    expect(
      f.sqlite
        .prepare('SELECT previousRevisionId FROM imageRevision WHERE id=?')
        .get(saved.imageRevisionId)?.previousRevisionId,
    ).toBe('image-r1')
    await expect(
      saveFeatureImageUploadDraft(f.db, {
        ...upload,
        storageKey: 'another-key',
        replacement,
      }),
    ).rejects.toThrow('Image changed')
  })
  it('commits task evidence with the proposal and fences later review against task movement', async () => {
    const f = fixture()
    await f.initialize()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('t','f','project','org','author',1,0,'2026-01-01','newPhoto')",
    )
    const saved = await saveFeatureImageUploadDraft(f.db, {
      ...upload,
      taskIds: ['t'],
      draftContributor: true,
    })
    if (saved.status !== 'saved') throw new Error('Expected task draft')
    expect(
      f.sqlite.prepare('SELECT imageId FROM taskImage WHERE taskId=?').get('t')
        ?.imageId,
    ).toBe(saved.imageId)
    expect(
      f.sqlite.prepare('SELECT modifiedAt FROM task WHERE id=?').get('t')?.modifiedAt,
    ).not.toBe('2026-01-01')
    const grant = await readFeatureUploadAttachmentGrant(f.db, {
      ...common,
      proposalId: saved.proposalId,
    })
    expect(await f.db.get(sql`SELECT ${grant.guard} allowed`)).toEqual({ allowed: 0 })
    f.sqlite.exec("UPDATE task SET isDraft=0 WHERE id='t'")
    expect(await f.db.get(sql`SELECT ${grant.guard} allowed`)).toEqual({ allowed: 1 })
    f.sqlite.exec("UPDATE task SET featureId='another' WHERE id='t'")
    expect(await f.db.get(sql`SELECT ${grant.guard} allowed`)).toEqual({ allowed: 0 })
  })
  it('submits task uploads together and completes the task only with the last explicit proposal decision', async () => {
    const f = fixture(),
      initial = await f.initialize()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('t','f','project','org','author',1,0,'2026-01-01','newPhoto')",
    )
    const first = await saveFeatureImageUploadDraft(f.db, {
      ...upload,
      taskIds: ['t'],
      draftContributor: true,
    })
    const second = await saveFeatureImageUploadDraft(f.db, {
      ...upload,
      storageKey: 'second-upload',
      taskIds: ['t'],
      draftContributor: true,
    })
    if (first.status !== 'saved' || second.status !== 'saved')
      throw new Error('Expected uploads')
    await executeRevisionBatch(f.db, sql`1`, [
      ...(await prepareFeatureUploadSubmission(f.db, { ...common, taskId: 't' })),
      f.db.update(task).set({ isDraft: false }).where(sql`id='t'`),
    ])
    expect(
      f.sqlite
        .prepare(
          "SELECT count(*) n FROM featureRevisionProposal WHERE status='submitted'",
        )
        .get()?.n,
    ).toBe(2)
    const grant = await readFeatureUploadAttachmentGrant(f.db, {
      ...common,
      proposalId: first.proposalId,
    })
    const result = await acceptFeatureEditorialRevision(f.db, {
      ...common,
      actorId: 'reviewer',
      expectedScope,
      proposalId: first.proposalId,
      expectedCandidateRevisionId: first.candidateRevisionId,
      expectedPublishedRevisionId: initial.revisionId,
      expectedGeneration: 0,
      galleryAttachmentGuard: grant.guard,
      validateResult: (a, b) => validateFeatureGalleryResult(a, b, grant.pins),
      canReviewPath: () => true,
    })
    expect(result.status).toBe('accepted')
    expect(
      f.sqlite.prepare("SELECT isReviewed FROM task WHERE id='t'").get()?.isReviewed,
    ).toBe(0)
    const command = {
      ...common,
      actorId: 'reviewer',
      proposalId: second.proposalId,
      expectedCandidateRevisionId: second.candidateRevisionId,
      reason: 'Duplicate photo',
    }
    expect(
      await rejectFeatureRevisionProposal(f.db, {
        ...command,
        decisionStatements: await prepareFeatureUploadTaskCompletion(f.db, command),
      }),
    ).toBe(true)
    expect(
      f.sqlite
        .prepare("SELECT isReviewed,reviewerId,reviewOutcome FROM task WHERE id='t'")
        .get(),
    ).toEqual({ isReviewed: 1, reviewerId: 'reviewer', reviewOutcome: 'accepted' })
    expect(
      f.sqlite
        .prepare('SELECT count(*) n FROM featureImage WHERE imageId=?')
        .get(second.imageId)?.n,
    ).toBe(0)
  })
  it('rolls back staff bytes, membership and accepted history on a late receipt failure', async () => {
    const f = fixture()
    await f.initialize()
    f.sqlite.exec(
      "CREATE TRIGGER fail_upload BEFORE INSERT ON featureRevisionPublication BEGIN SELECT RAISE(ABORT,'receipt failed'); END",
    )
    await expect(saveFeatureImageUploadDraft(f.db, upload)).rejects.toThrow()
    for (const table of [
      'featureRevisionProposal',
      'featureImageUploadRevision',
      'taskImage',
    ])
      expect(f.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()?.n).toBe(0)
    expect(f.sqlite.prepare('SELECT count(*) n FROM image').get()?.n).toBe(2)
    expect(f.sqlite.prepare('SELECT count(*) n FROM imageAssetVersion').get()?.n).toBe(
      2,
    )
  })
  it.each(['contain', 'cast-edges'] as const)(
    'accepts %s image metadata immediately without creating a review proposal',
    async presentationMode => {
      const f = fixture()
      await f.initialize()
      const before = (await f.capture()).snapshot
      const saved = await saveFeatureImageMetadata(f.db, {
        ...common,
        imageId: 'photo',
        expectedImageRevisionId: 'image-r1',
        derive: metadata => ({
          ...metadata,
          version: 2,
          renderRotation: 90,
          rotation: 90,
          presentationMode,
        }),
      })
      if (saved.status !== 'accepted') throw new Error('Expected accepted metadata')
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
      ).toBe(0)
      expect(
        f.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get()
          ?.publishedRevisionId,
      ).toBe(saved.revisionId)
      const revision = required(
        f.sqlite
          .prepare('SELECT * FROM imageRevision WHERE id=?')
          .get(saved.imageRevisionId),
      )
      expect(revision.previousRevisionId).toBe('image-r1')
      expect(revision.assetVersionId).toBe('asset-photo')
      expect(JSON.parse(String(revision.metadata)).renderRotation).toBe(90)
      const content = JSON.parse(
        String(
          required(
            f.sqlite
              .prepare(
                'SELECT r.content FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId',
              )
              .get(),
          ).content,
        ),
      )
      expect(content.gallery.entries.photo.imageRevisionId).toBe(saved.imageRevisionId)
      const pinned = await applyFeatureGalleryPins(f.db, [
        {
          id: 'f',
          images: [{ imageId: 'photo', isPublished: true, image: { id: 'photo' } }],
        },
      ])
      expect(pinned[0].images[0].image).toMatchObject({
        presentationMode,
        imageRevisionId: saved.imageRevisionId,
      })
      expect(content.gallery.entries.research.imageRevisionId).toBe('private-r1')
      expect(parseFeatureRevisionSource((await f.capture()).snapshot).images).toEqual(
        parseFeatureRevisionSource(before).images,
      )
    },
  )
  it('saves private image metadata immediately, preserves visibility and rejects stale pins', async () => {
    const f = fixture()
    f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    f.sqlite.exec("UPDATE feature SET isPublished=0,localIsPublished=0 WHERE id='f'")
    await f.initialize(false)
    const input = {
      ...common,
      imageId: 'photo',
      expectedImageRevisionId: 'image-r1',
      derive: (
        metadata: Parameters<
          Parameters<typeof saveFeatureImageMetadata>[1]['derive']
        >[0],
      ) => ({ ...metadata, version: 2, credit: 'Staff credit' }),
    }
    const saved = await saveFeatureImageMetadata(f.db, input)
    if (saved.status !== 'accepted') throw new Error('Expected accepted metadata')
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      ...common,
      canPublish: true,
    })
    expect(workspace.comparisonRevisionId).toBe(saved.revisionId)
    expect(workspace.publishedRevisionId).toBeNull()
    expect(workspace.proposals).toHaveLength(0)
    expect(
      f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get()
        ?.isPublished,
    ).toBe(0)
    await expect(saveFeatureImageMetadata(f.db, input)).rejects.toThrow('changed')
    expect(f.sqlite.prepare('SELECT count(*) n FROM imageRevision').get()?.n).toBe(3)
  })
  it('rolls back metadata registration when a late accepted history receipt fails', async () => {
    const f = fixture()
    await f.initialize()
    f.sqlite.exec(
      "CREATE TRIGGER fail_metadata BEFORE INSERT ON featureRevisionPublication BEGIN SELECT RAISE(ABORT,'history failed'); END",
    )
    await expect(
      saveFeatureImageMetadata(f.db, {
        ...common,
        imageId: 'photo',
        expectedImageRevisionId: 'image-r1',
        derive: metadata => ({ ...metadata, version: 2, renderRotation: 90 }),
      }),
    ).rejects.toThrow()
    expect(f.sqlite.prepare('SELECT count(*) n FROM imageRevision').get()?.n).toBe(2)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
    ).toBe(0)
  })
  it('invalidates a prepared legacy publication guard when enrollment completes', async () => {
    const f = fixture()
    const guard = await featureLegacyPublicationGuard(f.db, 'f')
    expect(await f.db.get(sql`SELECT ${guard} AS allowed`)).toEqual({ allowed: 1 })
    await f.initialize()
    expect(await f.db.get(sql`SELECT ${guard} AS allowed`)).toEqual({ allowed: 0 })
  })
  it('toggles accepted visibility without selecting a pending proposal', async () => {
    const f = fixture(),
      initial = await f.initialize()
    expect(
      await routeFeatureRevisionPublication(f.db, { ...common, state: true }),
    ).toBe('updated')
    expect(
      await routeFeatureRevisionPublication(f.db, { ...common, state: false }),
    ).toBe('updated')
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId,generation FROM featureRevisionHead WHERE featureId='f'",
        )
        .get(),
    ).toEqual({ publishedRevisionId: null, generation: 1 })
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      ...common,
      canPublish: true,
    })
    expect(workspace.comparisonRevisionId).toBe(initial.revisionId)
    expect(workspace.history[0]).toMatchObject({
      revisionId: null,
      actorId: 'author',
      reason: 'Feature unpublished',
    })
    expect(
      await routeFeatureRevisionPublication(f.db, { ...common, state: true }),
    ).toBe('updated')
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId,generation FROM featureRevisionHead WHERE featureId='f'",
        )
        .get(),
    ).toEqual({ publishedRevisionId: initial.revisionId, generation: 2 })
  })
  it('keeps another author draft private even from a publisher and reveals submitted text only', async () => {
    const f = fixture(),
      initial = await f.initialize()
    const draft = required(
      await createFeatureRevisionProposal(f.db, {
        ...common,
        baseRevisionId: initial.revisionId,
        content: initial.content,
      }),
    )
    const request = { ...common, actorId: 'other', canPublish: true }
    expect((await readFeatureRevisionWorkspace(f.db, request)).proposals).toEqual([])
    await submitFeatureRevisionProposal(f.db, {
      ...common,
      proposalId: draft.proposalId,
      expectedCandidateRevisionId: draft.candidateRevisionId,
    })
    const workspace = await readFeatureRevisionWorkspace(f.db, request)
    expect(workspace.proposals).toHaveLength(1)
    expect(JSON.stringify(workspace)).not.toContain('Internal')
    expect(JSON.stringify(workspace)).not.toContain('properties')
    expect(
      (await readFeatureRevisionWorkspace(f.db, { ...request, canPublish: false }))
        .proposals,
    ).toEqual([])
    expect(
      (await readFeatureRevisionWorkspace(f.db, { ...request, guard: sql`0` })).enabled,
    ).toBe(false)
  })
  it('applies accepted gallery order and visibility before pagination', async () => {
    const f = fixture()
    await f.initialize()
    const publicRows = await getImagesForFeature(
      f.db,
      [sql`featureImage.featureId='f'`],
      { limit: 1, offset: 0 },
      undefined,
      true,
    )
    expect(publicRows.map(row => row.id)).toEqual(['photo'])
    expect(publicRows[0]).toMatchObject({ publicId: 'immutable-photo', version: 1 })
    expect(
      await getImagesForFeature(
        f.db,
        [sql`featureImage.featureId='f'`],
        { limit: 1, offset: 1 },
        undefined,
        true,
      ),
    ).toEqual([])
    expect(
      (
        await getImagesForFeature(f.db, [sql`featureImage.featureId='f'`], {
          limit: 1,
          offset: 1,
        })
      ).map(row => row.id),
    ).toEqual(['research'])
  })
})

describe('Feature history around shared catalogue cascades', () => {
  it('shows actual accepted changes while retaining historical internal-field privacy after deletion', async () => {
    const f = fixture(false, true)
    await f.initialize()
    const capture = await prepareFeaturePropertyCascadeCapture(f.db, {
      propertyIds: ['private'],
      optionIds: [],
      actor: { actorId: 'catalogue-editor' },
    })
    await executeRevisionBatch(f.db, sql`1`, [
      ...capture.before,
      f.db.delete(property).where(sql`id='private'`),
      ...capture.after,
    ])
    const input = {
      featureId: 'f',
      generation: 1,
      guard: sql`1`,
      internalIds: new Set<string>(),
      allowedInternalIds: new Set<string>(),
    }
    const restricted = await readFeaturePublicationChanges(f.db, input)
    expect(restricted).toEqual({
      changes: [],
      redacted: true,
      baseline: false,
      unpublished: false,
    })
    const authorized = await readFeaturePublicationChanges(f.db, {
      ...input,
      allowedInternalIds: new Set(['private']),
    })
    expect(authorized?.redacted).toBe(false)
    expect(JSON.stringify(authorized?.changes)).toContain('Internal')
    expect(
      await readFeaturePublicationChanges(f.db, { ...input, guard: sql`0` }),
    ).toBeNull()
    expect(
      await readFeaturePublicationChanges(f.db, { ...input, generation: 0 }),
    ).toMatchObject({ changes: [], baseline: true })
  })
  it.each(['field', 'option'])(
    'captures the actual %s deletion without replacing historical definitions',
    async kind => {
      const f = fixture(false, true),
        initial = await f.initialize()
      const capture = await prepareFeaturePropertyCascadeCapture(f.db, {
        propertyIds: kind === 'field' ? ['choice'] : [],
        optionIds: kind === 'option' ? ['option'] : [],
        actor: { actorId: 'catalogue-editor' },
      })
      const deletion =
        kind === 'field'
          ? f.db.delete(property).where(sql`id='choice'`)
          : f.db.delete(propertyValue).where(sql`id='option'`)
      expect(
        await executeRevisionBatch(f.db, sql`1`, [
          ...capture.before,
          deletion,
          ...capture.after,
        ]),
      ).not.toBeNull()
      const row = required(
        f.sqlite
          .prepare(
            'SELECT r.content,r.previousRevisionId,c.actorId FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId',
          )
          .get(),
      )
      const content = JSON.parse(String(row.content))
      expect(row.previousRevisionId).toBe(initial.revisionId)
      expect(row.actorId).toBe('catalogue-editor')
      if (kind === 'field') expect(content.properties.choice).toBeUndefined()
      else
        expect(content.properties.choice.selection).toMatchObject({
          propertyValueId: null,
          definition: { selectedOption: null },
        })
      const old = required(
        f.sqlite
          .prepare('SELECT content FROM featureRevision WHERE id=?')
          .get(initial.revisionId),
      )
      expect(
        JSON.parse(String(old.content)).properties.choice.selection.propertyValueId,
      ).toBe('option')
    },
  )
  it('rolls back the shared deletion and Feature child rows on a late audit failure', async () => {
    const f = fixture(false, true),
      initial = await f.initialize()
    const capture = await prepareFeaturePropertyCascadeCapture(f.db, {
      propertyIds: ['private'],
      optionIds: [],
      actor: { actorId: 'catalogue-editor' },
    })
    f.sqlite.exec(
      "CREATE TRIGGER reject_catalogue_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 BEGIN SELECT RAISE(ABORT,'catalogue receipt failed'); END",
    )
    await expect(
      executeRevisionBatch(f.db, sql`1`, [
        ...capture.before,
        f.db.delete(property).where(sql`id='private'`),
        ...capture.after,
      ]),
    ).rejects.toThrow()
    expect(
      f.sqlite
        .prepare("SELECT value FROM featurePropertyI18n WHERE propertyId='private'")
        .get()?.value,
    ).toBe('Internal')
    expect(
      f.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get()
        ?.publishedRevisionId,
    ).toBe(initial.revisionId)
  })
  it('refuses a newly affected Feature added after cascade preparation', async () => {
    const f = fixture(false, true)
    await f.initialize()
    const capture = await prepareFeaturePropertyCascadeCapture(f.db, {
      propertyIds: ['choice'],
      optionIds: [],
      actor: { actorId: 'catalogue-editor' },
    })
    f.sqlite.exec(
      "INSERT INTO feature(id) VALUES('late-feature'); INSERT INTO featureProperty(featureId,propertyId) VALUES('late-feature','choice')",
    )
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...capture.before,
        f.db.delete(property).where(sql`id='choice'`),
        ...capture.after,
      ]),
    ).toBeNull()
    expect(
      f.sqlite
        .prepare("SELECT count(*) n FROM featureProperty WHERE propertyId='choice'")
        .get()?.n,
    ).toBe(2)
  })
  it('requires attribution for an enrolled cascade but creates no revisions for label-only edits', async () => {
    const f = fixture(false, true)
    await f.initialize()
    await expect(
      prepareFeaturePropertyCascadeCapture(f.db, {
        propertyIds: ['choice'],
        optionIds: [],
      }),
    ).rejects.toThrow('attributed editor')
    expect(
      await prepareFeaturePropertyCascadeCapture(f.db, {
        propertyIds: [],
        optionIds: [],
        actor: { actorId: 'editor' },
      }),
    ).toEqual({ before: [], after: [] })
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(1)
  })
})

describe('enrolled Feature task and hierarchy decisions', () => {
  it.each(['setIntangible', 'setUnpublished', 'setArchived'] as const)(
    'captures missing-report %s with its task decision',
    async action => {
      const f = fixture(),
        initial = await f.initialize()
      f.sqlite.exec(
        "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('missing','f','project','org','author',0,0,'task-token','reportedMissing')",
      )
      const command = {
        task: {
          id: 'missing',
          featureId: 'f',
          projectId: 'project',
          organisationId: 'org',
          type: 'reportedMissing' as const,
          modifiedAt: 'task-token',
        },
        feature: { id: 'f', modifiedAt: 'token' },
        resourceHubId: null,
        reviewerId: 'reviewer',
        action,
      }
      f.sqlite.exec(
        "CREATE TRIGGER fail_task_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 BEGIN SELECT RAISE(ABORT,'task receipt failed'); END",
      )
      await expect(commitTaskFeatureReview(f.db, command)).rejects.toThrow()
      expect(
        f.sqlite.prepare("SELECT isReviewed FROM task WHERE id='missing'").get()
          ?.isReviewed,
      ).toBe(0)
      expect(
        f.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get()
          ?.publishedRevisionId,
      ).toBe(initial.revisionId)
      f.sqlite.exec('DROP TRIGGER fail_task_receipt')
      expect(await commitTaskFeatureReview(f.db, command)).toBe(true)
      expect(
        f.sqlite.prepare("SELECT isReviewed FROM task WHERE id='missing'").get()
          ?.isReviewed,
      ).toBe(1)
      const workspace = await readFeatureRevisionWorkspace(f.db, {
        ...common,
        canPublish: true,
      })
      expect(workspace.publishedRevisionId === null).toBe(action !== 'setIntangible')
      const row = required(
        f.sqlite
          .prepare(
            'SELECT r.content,c.actorId FROM featureRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.id=?',
          )
          .get(required(workspace.comparisonRevisionId)),
      )
      expect(row.actorId).toBe('reviewer')
      const content = JSON.parse(String(row.content))
      if (action === 'setIntangible') expect(content.profile.isIntangible).toBe(true)
      else expect(content.profile.visitability.isVisitable).toBe(false)
    },
  )
  it('restores accepted visibility but never bulk publishes unpublished revisions or changes gallery policy', async () => {
    const f = fixture()
    await f.initialize(false)
    f.sqlite.exec(
      'ALTER TABLE layer ADD COLUMN localIsPublished INTEGER; ALTER TABLE layer ADD COLUMN publishedAt TEXT; ALTER TABLE layer ADD COLUMN publisherId TEXT;',
    )
    const before = (await f.capture()).snapshot
    await f.db.batch(
      await buildDescendantPublication(
        f.db,
        { kind: 'layer', id: 'layer' },
        { state: true, publishChildren: true },
      ),
    )
    expect(
      f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get()
        ?.isPublished,
    ).toBe(0)
    const eligibility = await featurePublicationEligibility(f.db)
    expect(
      await f.db.get(sql`SELECT ${eligibility} eligible FROM feature WHERE id='f'`),
    ).toEqual({ eligible: 0 })
    expect(
      parseFeatureRevisionSource((await f.capture()).snapshot).galleryLinks,
    ).toEqual(parseFeatureRevisionSource(before).galleryLinks)
  })
})

describe('enrolled Feature projection guards', () => {
  it.each(['accept', 'reject'] as const)(
    'atomically reviews an initial Feature and its submitted photos: %s',
    async action => {
      const f = fixture()
      f.sqlite.exec(
        readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
      )
      f.sqlite.exec(
        readFileSync('migrations/0187_feature_revision_creation.sql', 'utf8'),
      )
      f.sqlite.exec('UPDATE featureRevisionCreationPolicy SET enabled=1')
      const created = await createFeatureForm(f.db, {
        data: FeatureInsert.parse({
          id: 'contribution',
          organisationId: 'org',
          projectId: 'project',
          layerId: 'layer',
          contributorId: 'contributor',
          geometry: { type: 'Point', coordinates: [114, 22] },
          isDraft: true,
        }),
        i18n: { en: { title: 'Initial with photo' } },
        properties: [],
        revisionActor: { actorId: 'contributor', mode: 'contribution' },
      })
      f.sqlite.exec(
        "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES('initial-task','contribution','project','org','contributor',1,0,'2026-01-01T00:00:00.000Z','newFeature')",
      )
      const uploaded = await saveFeatureImageUploadDraft(f.db, {
        featureId: 'contribution',
        actorId: 'contributor',
        guard: sql`1`,
        storageNamespace: 'local',
        storageKey: 'initial-photo',
        mediaType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]).buffer,
        taskIds: ['initial-task'],
        draftContributor: true,
        intent: 'general',
        deriveMetadata: () => ({ version: 1, presentationMode: 'contain' }),
      })
      if (uploaded.status !== 'saved') throw new Error('Missing initial upload')
      const taskToken = String(
        required(
          f.sqlite.prepare("SELECT modifiedAt FROM task WHERE id='initial-task'").get(),
        ).modifiedAt,
      )
      expect(
        await commitTaskFeatureDraftFinalization(f.db, {
          task: {
            id: 'initial-task',
            featureId: 'contribution',
            contributorId: 'contributor',
            modifiedAt: taskToken,
          },
          feature: created,
        }),
      ).toBe(true)
      const initial = required(
        f.sqlite
          .prepare(
            "SELECT * FROM featureInitialRevision WHERE featureId='contribution'",
          )
          .get(),
      )
      const initialHead = required(
        f.sqlite
          .prepare("SELECT * FROM featureRevisionHead WHERE featureId='contribution'")
          .get(),
      )
      expect(
        await publishFeatureStaffDraft(f.db, {
          featureId: 'contribution',
          actorId: 'reviewer',
          guard: sql`1`,
          expectedScope,
          proposalId: uploaded.proposalId,
          expectedCandidateRevisionId: uploaded.candidateRevisionId,
          expectedPublishedRevisionId: null,
          expectedComparisonRevisionId: String(
            initialHead.publishedRevisionId ?? initial.candidateRevisionId,
          ),
          expectedGeneration: 0,
          validateResult: () => [],
          canReviewPath: () => true,
        }),
      ).toEqual({
        status: 'invalid',
        errors: ['Review this initial contribution through its task'],
      })
      const featureToken = String(
        required(
          f.sqlite
            .prepare("SELECT modifiedAt FROM feature WHERE id='contribution'")
            .get(),
        ).modifiedAt,
      )
      const reviewToken = String(
        required(
          f.sqlite.prepare("SELECT modifiedAt FROM task WHERE id='initial-task'").get(),
        ).modifiedAt,
      )
      const command = {
        task: {
          id: 'initial-task',
          featureId: 'contribution',
          projectId: 'project',
          organisationId: 'org',
          type: 'newFeature' as const,
          modifiedAt: reviewToken,
        },
        feature: { id: 'contribution', modifiedAt: featureToken },
        resourceHubId: null,
        reviewerId: 'reviewer',
        action,
      }
      f.sqlite.exec(
        "CREATE TRIGGER fail_initial_task_completion BEFORE UPDATE ON task WHEN NEW.isReviewed=1 BEGIN SELECT RAISE(ABORT,'late initial task failure'); END",
      )
      await expect(commitTaskFeatureReview(f.db, command)).rejects.toThrow()
      expect(
        f.sqlite
          .prepare("SELECT isPublished FROM feature WHERE id='contribution'")
          .get()?.isPublished,
      ).toBe(0)
      expect(
        f.sqlite
          .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
          .get(uploaded.proposalId)?.status,
      ).toBe('submitted')
      f.sqlite.exec('DROP TRIGGER fail_initial_task_completion')
      expect(await commitTaskFeatureReview(f.db, command)).toBe(true)
      expect(
        f.sqlite
          .prepare("SELECT isPublished,isArchived FROM feature WHERE id='contribution'")
          .get(),
      ).toEqual({
        isPublished: 0,
        isArchived: Number(action === 'reject'),
      })
      expect(
        f.sqlite
          .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
          .get(uploaded.proposalId)?.status,
      ).toBe(action === 'accept' ? 'accepted' : 'rejected')
      if (action === 'accept')
        expect(
          f.sqlite
            .prepare(
              "SELECT isPublished FROM featureImage WHERE featureId='contribution'",
            )
            .get()?.isPublished,
        ).toBe(0)
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
      ).toBe(0)
      expect(await commitTaskFeatureReview(f.db, command)).toBe(false)
    },
  )
  it('retains every private initial contribution edit and freezes it at submission', async () => {
    const f = fixture()
    f.sqlite.exec(
      readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
    )
    f.sqlite.exec(readFileSync('migrations/0187_feature_revision_creation.sql', 'utf8'))
    f.sqlite.exec('UPDATE featureRevisionCreationPolicy SET enabled=1')
    const created = await createFeatureForm(f.db, {
      data: FeatureInsert.parse({
        id: 'contribution',
        organisationId: 'org',
        projectId: 'project',
        layerId: 'layer',
        contributorId: 'contributor',
        geometry: { type: 'Point', coordinates: [114, 22] },
        isDraft: true,
      }),
      i18n: { en: { title: 'First draft' } },
      properties: [],
      revisionActor: { actorId: 'contributor', mode: 'contribution' },
    })
    expect(await readFeatureLocationBaseline(f.db, created.id, 'project')).toEqual({
      status: 'ineligible',
      reason: 'draft',
    })
    const command = {
      featureId: created.id,
      projectId: 'project',
      updatedAt: created.modifiedAt,
      expectedDraftState: true,
      actorId: 'contributor',
      data: {},
      i18n: { en: { title: 'Second draft' } },
    }
    f.sqlite.exec(
      "CREATE TRIGGER fail_initial_save BEFORE INSERT ON featureRevision WHEN json_extract(NEW.content,'$.translations.en.title.value')='Second draft' BEGIN SELECT RAISE(ABORT,'late initial save'); END",
    )
    await expect(saveUnlinkedFeatureForm(f.db, command)).rejects.toThrow()
    expect(
      f.sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='contribution'")
        .get()?.title,
    ).toBe('First draft')
    f.sqlite.exec('DROP TRIGGER fail_initial_save')
    const saved = await saveUnlinkedFeatureForm(f.db, command)
    expect(saved).toBeDefined()
    expect(await saveUnlinkedFeatureForm(f.db, command)).toBeUndefined()
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      featureId: created.id,
      actorId: 'contributor',
      canPublish: false,
      guard: sql`1`,
    })
    expect(workspace).toMatchObject({
      publishedRevisionId: null,
      generation: 0,
      proposals: [{ after: { en: { title: 'Second draft' } } }],
    })
    const revisions = f.sqlite
      .prepare(
        "SELECT json_extract(content,'$.translations.en.title.value') title FROM featureRevision WHERE featureId='contribution' ORDER BY rowid",
      )
      .all()
    expect(revisions.map(row => row.title)).toEqual([
      'First draft',
      'First draft',
      'Second draft',
    ])
    const domain = await prepareFeatureAcceptedCapture(f.db, {
      featureId: created.id,
      actorId: 'approved-system',
      origin: 'system',
      guard: sql`1`,
      derive: previous => ({
        ...previous,
        profile: { ...previous.profile, isIntangible: true },
      }),
    })
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...domain.before,
        f.db.update(feature).set({ isIntangible: true }).where(sql`id=${created.id}`),
        ...domain.after,
      ]),
    ).not.toBeNull()
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId,generation FROM featureRevisionHead WHERE featureId='contribution'",
        )
        .get(),
    ).toEqual({ publishedRevisionId: null, generation: 0 })
    expect(
      f.sqlite
        .prepare(
          'SELECT c.actorId FROM featureRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.id=?',
        )
        .get(required(domain.revisionId))?.actorId,
    ).toBe('approved-system')
    const submission = await prepareInitialFeatureSubmission(f.db, {
      featureId: created.id,
      actorId: 'contributor',
      guard: sql`1`,
    })
    expect(await executeRevisionBatch(f.db, sql`1`, submission)).not.toBeNull()
    f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    await expect(
      prepareFeatureAcceptedCapture(f.db, {
        featureId: created.id,
        actorId: 'policy:location',
        origin: 'system',
        guard: sql`1`,
        derive: previous => previous,
      }),
    ).rejects.toThrow('Submitted initial contributions are frozen for task review')
    expect(
      await saveUnlinkedFeatureForm(f.db, {
        ...command,
        updatedAt: required(saved).modifiedAt,
      }),
    ).toBeUndefined()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
    ).toBe(0)
  })
  it('initializes accepted private staff content atomically without a proposal', async () => {
    const f = fixture()
    f.sqlite.exec(
      readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
    )
    f.sqlite.exec(readFileSync('migrations/0187_feature_revision_creation.sql', 'utf8'))
    f.sqlite.exec(readFileSync('migrations/0190_feature_creation_boundary.sql', 'utf8'))
    f.sqlite.exec('UPDATE featureRevisionCreationPolicy SET enabled=1')
    expect(() =>
      f.sqlite.exec("INSERT INTO feature(id) VALUES('legacy-bypass')"),
    ).toThrow('attributed atomic writer')
    const input = {
      data: FeatureInsert.parse({
        id: 'new',
        organisationId: 'org',
        projectId: 'project',
        layerId: 'layer',
        geometry: { type: 'Point' as const, coordinates: [114, 22] },
        isDraft: true,
      }),
      i18n: { en: { title: 'New draft' } },
      properties: [{ propertyId: 'choice', propertyValueId: 'option' }],
      revisionActor: { actorId: 'creator', mode: 'staff' as const },
    }
    f.sqlite.exec(
      "CREATE TRIGGER fail_initial_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.featureId='new' BEGIN SELECT RAISE(ABORT,'initial receipt failure'); END",
    )
    await expect(createFeatureForm(f.db, input)).rejects.toThrow()
    expect(
      f.sqlite.prepare("SELECT id FROM feature WHERE id='new'").get(),
    ).toBeUndefined()
    expect(
      f.sqlite
        .prepare("SELECT count(*) n FROM featureRevision WHERE featureId='new'")
        .get()?.n,
    ).toBe(0)
    f.sqlite.exec('DROP TRIGGER fail_initial_receipt')
    expect(await createFeatureForm(f.db, input)).toMatchObject({
      id: 'new',
      isPublished: false,
    })
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      featureId: 'new',
      actorId: 'creator',
      canPublish: true,
      guard: sql`1`,
    })
    expect(workspace).toMatchObject({
      enabled: true,
      publishedRevisionId: null,
      generation: 0,
      proposals: [],
    })
    expect(
      f.sqlite
        .prepare(
          'SELECT actorId,origin FROM revisionChangeSet WHERE id=(SELECT changeSetId FROM featureRevision WHERE id=?)',
        )
        .get(required(workspace.comparisonRevisionId)),
    ).toEqual({ actorId: 'creator', origin: 'user' })
    expect(
      await routeFeatureRevisionPublication(f.db, {
        featureId: 'new',
        actorId: 'creator',
        guard: sql`1`,
        state: true,
      }),
    ).toBe('updated')
  })
  it.each(['acceptAll', 'acceptClassified', 'reject'] as const)(
    'records legacy photo %s with immutable pins and atomic task completion',
    async action => {
      const f = fixture()
      f.sqlite.exec(
        "ALTER TABLE project ADD COLUMN imageId TEXT; ALTER TABLE organisation ADD COLUMN imageId TEXT; ALTER TABLE hub ADD COLUMN imageId TEXT; UPDATE featureImage SET isPublished=0,localIsPublished=0 WHERE imageId='photo'; INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('photos','f','project','org','author',0,0,'task-token','newPhoto'); INSERT INTO taskImage VALUES ('photos','photo'),('photos','research')",
      )
      const baseline = await f.initialize()
      f.sqlite.exec(
        readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
      )
      const command = {
        task: {
          id: 'photos',
          featureId: 'f',
          projectId: 'project',
          organisationId: 'org',
          type: 'newPhoto' as const,
          modifiedAt: 'task-token',
        },
        resourceHubId: null,
        reviewerId: 'reviewer',
        action,
      }
      const before = (await f.capture()).snapshot
      f.sqlite.exec(
        "CREATE TRIGGER fail_photo_completion BEFORE UPDATE ON task WHEN NEW.isReviewed=1 BEGIN SELECT RAISE(ABORT,'late task failure'); END",
      )
      await expect(commitTaskImageReview(f.db, command)).rejects.toThrow()
      expect((await f.capture()).snapshot).toEqual(before)
      expect(
        f.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get()
          ?.publishedRevisionId,
      ).toBe(baseline.revisionId)
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
      ).toBe(0)
      f.sqlite.exec('DROP TRIGGER fail_photo_completion')
      expect(await commitTaskImageReview(f.db, command)).toBe(true)
      const row = required(
        f.sqlite
          .prepare(
            'SELECT r.content,c.actorId FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId',
          )
          .get(),
      )
      expect(row.actorId).toBe('reviewer')
      const gallery = JSON.parse(String(row.content)).gallery
      if (action === 'reject') expect(gallery.order).toEqual([])
      else {
        expect(gallery.entries.photo).toMatchObject({
          imageRevisionId: 'image-r1',
          isPublished: true,
        })
        expect(gallery.entries.research.isPublished).toBe(false)
      }
      expect(
        f.sqlite.prepare("SELECT isArchived FROM image WHERE id='photo'").get()
          ?.isArchived,
      ).toBe(0)
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
      ).toBe(0)
      expect(await commitTaskImageReview(f.db, command)).toBe(false)
    },
  )
  it('records status updates under projection guards and rejects stale or content-bearing commands', async () => {
    const f = fixture()
    await f.initialize()
    f.sqlite.exec(
      readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
    )
    const command = { ...common, updatedAt: 'token', data: { isIntangible: true } }
    const result = await updateFeatureRevisionState(f.db, command)
    expect(result).toMatchObject({ status: 'updated', feature: { isIntangible: true } })
    expect(await updateFeatureRevisionState(f.db, command)).toEqual({
      status: 'updated',
      feature: undefined,
    })
    expect(
      await updateFeatureRevisionState(f.db, {
        ...command,
        updatedAt:
          result.status === 'updated' ? required(result.feature).modifiedAt : '',
        data: { isPublished: true },
      }),
    ).toMatchObject({ status: 'updated' })
    await expect(
      updateFeatureRevisionState(f.db, {
        ...command,
        data: { geometry: { type: 'Point', coordinates: [114, 22] } },
      }),
    ).rejects.toThrow('regular editor')
    if (result.status !== 'updated' || !result.feature)
      throw new Error('Missing updated Feature')
    expect(
      await updateFeatureRevisionState(f.db, {
        ...command,
        updatedAt: result.feature.modifiedAt,
        data: { isPublished: false },
      }),
    ).toMatchObject({ status: 'updated', feature: { isPublished: false } })
    expect(
      f.sqlite
        .prepare('SELECT publishedRevisionId,generation FROM featureRevisionHead')
        .get(),
    ).toEqual({ publishedRevisionId: null, generation: 3 })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
    ).toBe(0)
  })
  it('rejects legacy/import writes but permits atomic reviewed publication without leaked scopes', async () => {
    const f = fixture(),
      baseline = await f.initialize()
    f.sqlite.exec(
      readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
    )
    for (const statement of [
      "UPDATE feature SET isIntangible=1 WHERE id='f'",
      "UPDATE featureI18n SET title='unaudited' WHERE featureId='f'",
      "DELETE FROM featureProperty WHERE featureId='f'",
      "UPDATE featureImage SET intent='research' WHERE featureId='f'",
    ])
      expect(() => f.sqlite.exec(statement)).toThrow('revision transaction')
    const content = structuredClone(baseline.content)
    content.translations.en.title = { value: 'Reviewed with guards', generated: false }
    const proposal = await f.proposal(baseline.revisionId, content)
    f.sqlite.exec(
      "CREATE TRIGGER fail_guarded_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 BEGIN SELECT RAISE(ABORT,'late failure'); END",
    )
    await expect(
      f.accept(baseline.content, baseline.revisionId, 0, proposal),
    ).rejects.toThrow()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
    ).toBe(0)
    f.sqlite.exec('DROP TRIGGER fail_guarded_receipt')
    expect(
      (await f.accept(baseline.content, baseline.revisionId, 0, proposal)).status,
    ).toBe('accepted')
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
    ).toBe(0)
    expect(
      f.sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('Reviewed with guards')
  })
  it('permits attributed gallery commands and catalogue cascades under the same guards', async () => {
    const f = fixture(false, true)
    await f.initialize()
    f.sqlite.exec(
      readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
    )
    await updateImageWithFeatureImage(
      f.db,
      {},
      { featureId: 'f', intent: 'general' },
      'photo',
      undefined,
      undefined,
      'reviewer',
    )
    const capture = await prepareFeaturePropertyCascadeCapture(f.db, {
      propertyIds: [],
      optionIds: ['option'],
      actor: { actorId: 'catalogue-editor' },
    })
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...capture.before,
        f.db.delete(propertyValue).where(sql`id='option'`),
        ...capture.after,
      ]),
    ).not.toBeNull()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
    ).toBe(0)
    expect(
      f.sqlite.prepare('SELECT generation FROM featureRevisionHead').get()?.generation,
    ).toBe(2)
  })
})

// Identity integration uses the same complete projection fixture and real write guards.
describe('reviewed Feature merge and split integration', () => {
  it('clears the temporary unlink attribution wrapper when the selected source has null brands', async () => {
    const f = fixture(true),
      baseline = await f.initialize()
    f.sqlite.exec(`CREATE TABLE unlinkEvidence(actorId TEXT);
      CREATE TRIGGER inspect_unlink AFTER DELETE ON featureLocation BEGIN
        INSERT INTO unlinkEvidence SELECT json_extract(localLocationBrands,'$.actorId') FROM feature WHERE id=OLD.featureId;
      END;`)
    const content = structuredClone(baseline.content)
    content.placement.location = null
    content.detachedBrands = null
    const plan = prepareFeatureEditorialProjection(f.db, {
      featureId: 'f',
      source: await f.capture(),
      previous: baseline.content,
      content,
      identity: { actorId: 'identity-reviewer' },
    })
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...plan.statements,
        prepareRevisionCheck(f.db, plan.verify),
      ]),
    ).not.toBeNull()
    expect(f.sqlite.prepare('SELECT * FROM unlinkEvidence').all()).toEqual([
      { actorId: 'identity-reviewer' },
    ])
    expect(
      f.sqlite.prepare("SELECT localLocationBrands FROM feature WHERE id='f'").get(),
    ).toEqual({ localLocationBrands: null })
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureLocation').get()).toEqual({
      n: 0,
    })
  })
  async function identityFixture(linked = false) {
    const f = fixture(linked)
    f.sqlite.exec(`CREATE TABLE userFeature(userId TEXT,featureId TEXT,isVisited INTEGER,isWishlisted INTEGER,visitedAt TEXT,modifiedAt TEXT,createdAt TEXT DEFAULT 'initial',PRIMARY KEY(userId,featureId));
      INSERT INTO userFeature(userId,featureId,isVisited,isWishlisted,visitedAt,modifiedAt) VALUES('visitor','f',1,1,'original visit','initial');`)
    f.sqlite.exec(
      readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
    )
    f.sqlite.exec(
      readFileSync('migrations/0188_feature_identity_proposals.sql', 'utf8'),
    )
    f.sqlite.exec(
      readFileSync('migrations/0191_feature_identity_relationships.sql', 'utf8'),
    )
    const baseline = await f.initialize()
    const command = { ...common, allowedInternalIds: new Set(['private']) }
    const input = { featureId: 'f', revisionId: baseline.revisionId, generation: 0 }
    return { ...f, baseline, command, input }
  }
  it('takes every localized address from the selected placement without importing unrelated text', async () => {
    const f = await identityFixture()
    const primary = structuredClone(f.baseline.content)
    const incoming = structuredClone(primary)
    primary.translations.en.address = {
      value: 'Old address',
      generated: false,
      properties: { old: true },
    }
    incoming.translations.en.address = {
      value: 'New address',
      generated: true,
      properties: { new: true },
    }
    primary.translations.fr = structuredClone(primary.translations.en)
    incoming.translations.zh = structuredClone(incoming.translations.en)
    incoming.placement.geometry = { type: 'Point', coordinates: [115, 23] }
    const sources = new Map([
      ['f', { content: primary }],
      ['other', { content: incoming }],
    ])
    const input = {
      kind: 'merge' as const,
      featureId: 'f',
      layerId: 'layer',
      allowedInternalIds: new Set(['private']),
      sources,
    }
    const content = await buildSelectedFeatureIdentityContent(f.db, {
      ...input,
      output: {
        featureId: 'f',
        sourceFeatureId: 'f',
        placementSourceFeatureId: 'other',
      },
    })
    expect(content.placement.geometry).toEqual(incoming.placement.geometry)
    expect(content.translations.en.address).toEqual(incoming.translations.en.address)
    expect(content.translations.zh.address).toEqual(incoming.translations.zh.address)
    expect(content.translations.fr.address).toEqual({
      value: null,
      generated: false,
      properties: null,
    })
    expect(content.translations.en.title).toEqual(primary.translations.en.title)
    const kept = await buildSelectedFeatureIdentityContent(f.db, {
      ...input,
      output: { featureId: 'f', sourceFeatureId: 'f' },
    })
    expect(kept.translations.zh.address.value).toBeNull()
    expect(primary.translations.en.address.value).toBe('Old address')
  })
  it('keeps inherited names and phone fields with an imported shared Location', async () => {
    const f = await identityFixture(true)
    const primary = structuredClone(f.baseline.content)
    const incoming = structuredClone(primary)
    incoming.translations.en.title.value = 'Incoming shared name'
    primary.properties.private.selection.definition.component = 'PhoneField'
    incoming.properties.private.selection.definition.component = 'PhoneField'
    incoming.properties.private.selection.value = 'Incoming phone'
    const input = {
      kind: 'merge' as const,
      featureId: 'f',
      layerId: 'layer',
      allowedInternalIds: new Set(['private']),
      sources: new Map([
        ['f', { content: primary }],
        ['other', { content: incoming }],
      ]),
    }
    const output = {
      featureId: 'f',
      sourceFeatureId: 'f',
      placementSourceFeatureId: 'other',
      titles: { en: 'Incoming shared name' },
    }
    const content = await buildSelectedFeatureIdentityContent(f.db, {
      ...input,
      output,
    })
    expect(content.translations.en.title.value).toBe('Incoming shared name')
    expect(content.properties.private.selection.value).toBe('Incoming phone')
    await expect(
      buildSelectedFeatureIdentityContent(f.db, {
        ...input,
        output: {
          ...output,
          properties: [{ propertyId: 'private', sourceFeatureId: 'f' }],
        },
      }),
    ).rejects.toThrow('Shared phone values')
    await expect(
      buildSelectedFeatureIdentityContent(f.db, {
        ...input,
        output: {
          ...output,
          properties: [{ propertyId: 'private', sourceFeatureId: 'other' }],
        },
      }),
    ).resolves.toMatchObject({
      properties: { private: { selection: { value: 'Incoming phone' } } },
    })
  })
  it('retains inspected image pins while applying selected photo intents', async () => {
    const f = await identityFixture()
    const original = structuredClone(f.baseline.content)
    const images = original.gallery.order.map(imageId => ({
      sourceFeatureId: 'f',
      imageId,
      intent: 'research' as const,
    }))
    const content = await buildSelectedFeatureIdentityContent(f.db, {
      kind: 'merge',
      featureId: 'f',
      layerId: 'layer',
      allowedInternalIds: new Set(['private']),
      sources: new Map([['f', { content: original }]]),
      output: { featureId: 'f', sourceFeatureId: 'f', images },
    })
    for (const image of images) {
      expect(content.gallery.entries[image.imageId].intent).toBe('research')
      expect(content.gallery.entries[image.imageId].isPublished).toBe(false)
      expect(content.gallery.entries[image.imageId].imageRevisionId).toBe(
        original.gallery.entries[image.imageId].imageRevisionId,
      )
    }
    expect(f.baseline.content).toEqual(original)
    await expect(
      buildSelectedFeatureIdentityContent(f.db, {
        kind: 'merge',
        featureId: 'f',
        layerId: 'layer',
        allowedInternalIds: new Set(['private']),
        sources: new Map([['f', { content: original }]]),
        output: {
          featureId: 'f',
          sourceFeatureId: 'f',
          images: [{ sourceFeatureId: 'f', imageId: 'uninspected', intent: 'general' }],
        },
      }),
    ).rejects.toThrow('Invalid or duplicate image selection')
  })
  it('selects a catalogue option outside the two snapshots and rejects unavailable options', async () => {
    const f = await identityFixture()
    f.sqlite.exec(
      "INSERT INTO propertyValue(id,propertyId,rank,value) VALUES ('third-option','choice',9,'New catalogue option'); INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) VALUES ('third-option','en','Third choice',0)",
    )
    const original = structuredClone(f.baseline.content)
    const input = {
      kind: 'merge' as const,
      featureId: 'f',
      layerId: 'layer',
      allowedInternalIds: new Set(['private']),
      sources: new Map([['f', { content: original }]]),
    }
    const content = await buildSelectedFeatureIdentityContent(f.db, {
      ...input,
      output: {
        featureId: 'f',
        sourceFeatureId: 'f',
        propertyOptionEdits: { choice: 'third-option' },
      },
    })
    expect(content.properties.choice.selection.propertyValueId).toBe('third-option')
    expect(
      content.properties.choice.selection.definition.selectedOption?.translations.en
        .value,
    ).toBe('Third choice')
    expect(f.baseline.content).toEqual(original)
    await expect(
      buildSelectedFeatureIdentityContent(f.db, {
        ...input,
        output: {
          featureId: 'f',
          sourceFeatureId: 'f',
          propertyOptionEdits: { choice: 'missing-option' },
        },
      }),
    ).rejects.toThrow('does not belong to this category')
    const cleared = await buildSelectedFeatureIdentityContent(f.db, {
      ...input,
      output: {
        featureId: 'f',
        sourceFeatureId: 'f',
        propertyOptionEdits: { choice: null },
      },
    })
    expect(cleared.properties.choice.selection.propertyValueId).toBeNull()
    expect(cleared.properties.choice.selection.definition.selectedOption).toBeNull()
  })
  it('validates translated field edits without replacing the inspected definition', async () => {
    const f = await identityFixture()
    const original = structuredClone(f.baseline.content)
    const content = await buildSelectedFeatureIdentityContent(f.db, {
      kind: 'merge',
      featureId: 'f',
      layerId: 'layer',
      allowedInternalIds: new Set(['private']),
      sources: new Map([['f', { content: original }]]),
      output: {
        featureId: 'f',
        sourceFeatureId: 'f',
        propertyTranslationEdits: { private: { en: 'Reviewed translation' } },
      },
    })
    expect(content.properties.private.translations.en).toEqual({
      value: 'Reviewed translation',
      generated: false,
    })
    expect(content.properties.private.selection.definition).toEqual(
      original.properties.private.selection.definition,
    )
    expect(f.baseline.content).toEqual(original)
    await expect(
      buildSelectedFeatureIdentityContent(f.db, {
        kind: 'merge',
        featureId: 'f',
        layerId: 'layer',
        allowedInternalIds: new Set(['private']),
        sources: new Map([['f', { content: original }]]),
        output: {
          featureId: 'f',
          sourceFeatureId: 'f',
          propertyTranslationEdits: { choice: { en: 'Forged option' } },
        },
      }),
    ).rejects.toThrow('Edit this field through its regular editor')
  })
  it('publishes the reviewed cover without changing source image pins and rejects an unselected cover', async () => {
    const f = await identityFixture()
    const gallery = f.baseline.content.gallery
    const coverImageId = gallery.order[1]
    expect(coverImageId).toBeTruthy()
    const selection = {
      kind: 'split' as const,
      inputs: [f.input],
      reason: 'Photo-specific results',
      outputs: [
        { featureId: null, sourceFeatureId: 'f', coverImageId },
        { featureId: null, sourceFeatureId: 'f', images: [] },
      ],
    }
    await expect(
      createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          ...selection,
          outputs: [
            { featureId: null, sourceFeatureId: 'f', images: [], coverImageId },
            selection.outputs[1],
          ],
        },
      }),
    ).rejects.toThrow('Cover photo must be selected')
    const id = required(
      await createFeatureIdentityProposal(f.db, { ...f.command, selection }),
    )
    const proposal = required(await readFeatureIdentityProposal(f.db, id))
    const candidate = required(
      f.sqlite
        .prepare('SELECT content FROM featureRevision WHERE id=?')
        .get(proposal.plan.outputs[0].revisionId),
    )
    const content = JSON.parse(String(candidate.content)) as FeatureRevisionContent
    expect(content.gallery.entries[coverImageId].intent).toBe('canonical')
    expect(
      Object.values(content.gallery.entries).filter(
        entry => entry.intent === 'canonical',
      ),
    ).toHaveLength(1)
    for (const imageId of gallery.order)
      expect(content.gallery.entries[imageId].imageRevisionId).toBe(
        gallery.entries[imageId].imageRevisionId,
      )
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: id,
        accept: true,
        reason: 'Reviewed gallery',
        relationshipsReviewed: true,
        taskAssignments: [],
      }),
    ).toBeTruthy()
    expect(
      f.sqlite
        .prepare('SELECT intent FROM featureImage WHERE featureId=? AND imageId=?')
        .get(proposal.plan.outputs[0].featureId, coverImageId)?.intent,
    ).toBe('canonical')
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('requires explicit destinations, moves open tasks and preserves completed tasks and visits', async () => {
    const f = await identityFixture()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('open','f','project','org','author',0,0,'2026-01-01','reportedMissing'),('done','f','project','org','author',0,1,'2026-01-01','reportedMissing')",
    )
    const id = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Two sites',
          outputs: [
            { featureId: 'f', sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f' },
          ],
        },
      }),
    )
    const child = required(await readFeatureIdentityProposal(f.db, id)).plan.outputs[1]
      .featureId
    const decide = {
      ...f.command,
      proposalId: id,
      accept: true,
      reason: 'Reviewed',
      relationshipsReviewed: true as const,
    }
    await expect(
      decideFeatureIdentityProposal(f.db, { ...decide, taskAssignments: [] }),
    ).rejects.toThrow(/every open task/)
    await expect(
      decideFeatureIdentityProposal(f.db, {
        ...decide,
        taskAssignments: [{ taskId: 'open', featureId: 'foreign' }],
      }),
    ).rejects.toThrow(/every open task/)
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...decide,
        taskAssignments: [{ taskId: 'open', featureId: child }],
      }),
    ).toBeTruthy()
    expect(
      f.sqlite.prepare("SELECT featureId FROM task WHERE id='open'").get()?.featureId,
    ).toBe(child)
    expect(
      f.sqlite
        .prepare("SELECT featureId,modifiedAt,isReviewed FROM task WHERE id='done'")
        .get(),
    ).toEqual({ featureId: 'f', modifiedAt: '2026-01-01', isReviewed: 1 })
    expect(
      f.sqlite
        .prepare(
          'SELECT sourceFeatureId,targetFeatureId,sequence FROM featureTaskTransfer',
        )
        .get(),
    ).toEqual({ sourceFeatureId: 'f', targetFeatureId: child, sequence: 1 })
    expect(
      f.sqlite
        .prepare(
          "SELECT isVisited,visitedAt,isWishlisted FROM userFeature WHERE featureId='f'",
        )
        .get(),
    ).toEqual({ isVisited: 1, visitedAt: 'original visit', isWishlisted: 1 })
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('forwards only uploaded photo changes through repeated moves, preserving pins and contributor attribution', async () => {
    const f = await identityFixture()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('photo-task','f','project','org','author',1,0,'2026-01-01','newPhoto')",
    )
    const upload = await saveFeatureImageUploadDraft(f.db, {
      ...common,
      taskIds: ['photo-task'],
      draftContributor: true,
      storageNamespace: 'local',
      storageKey: 'task-upload',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      intent: 'general',
      deriveMetadata: () => ({ version: 1, presentationMode: 'contain' }),
    })
    if (upload.status !== 'saved') throw new Error('Expected upload')
    await executeRevisionBatch(f.db, sql`1`, [
      ...(await prepareFeatureUploadSubmission(f.db, {
        ...common,
        taskId: 'photo-task',
      })),
      f.db.update(task).set({ isDraft: false }).where(sql`id='photo-task'`),
    ])
    const split = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Two sites',
          outputs: [
            { featureId: 'f', sourceFeatureId: 'f' },
            {
              featureId: null,
              sourceFeatureId: 'f',
              titles: { en: 'Destination name' },
            },
          ],
        },
      }),
    )
    const outputs = required(await readFeatureIdentityProposal(f.db, split)).plan
      .outputs
    const child = outputs[1].featureId
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        actorId: 'reviewer',
        proposalId: split,
        accept: true,
        reason: 'Move photo work',
        relationshipsReviewed: true,
        taskAssignments: [{ taskId: 'photo-task', featureId: child }],
      }),
    ).toBeTruthy()
    const forwarded = required(
      f.sqlite
        .prepare(
          'SELECT p.*,r.content,c.actorId FROM featureTaskUploadEvidence u JOIN featureRevisionProposal p ON p.id=u.proposalId JOIN featureRevision r ON r.id=p.candidateRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId',
        )
        .get(),
    )
    expect(forwarded.contributorId).toBe('author')
    expect(forwarded.actorId).toBe('reviewer')
    expect(forwarded.status).toBe('submitted')
    expect(forwarded.featureId).toBe(child)
    expect(JSON.parse(String(forwarded.content)).translations.en.title.value).toBe(
      'Destination name',
    )
    expect(
      f.sqlite
        .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
        .get(upload.proposalId)?.status,
    ).toBe('withdrawn')
    expect(
      (
        await applyFeatureUploadTaskPins(f.db, [
          { id: upload.imageId, taskId: 'photo-task', featureId: child },
        ])
      )[0],
    ).toMatchObject({
      imageRevisionId: upload.imageRevisionId,
      publicId: 'task-upload',
    })
    const merge = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'merge',
          inputs: outputs.map(ref => ({ ...ref, generation: 1 })),
          reason: 'Combine sites',
          outputs: [{ featureId: 'f', sourceFeatureId: 'f' }],
        },
      }),
    )
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        actorId: 'reviewer',
        proposalId: merge,
        accept: true,
        reason: 'Return work',
        relationshipsReviewed: true,
        taskAssignments: [{ taskId: 'photo-task', featureId: 'f' }],
      }),
    ).toBeTruthy()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureTaskTransfer').get()?.n,
    ).toBe(2)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureImageUploadRevision').get()?.n,
    ).toBe(1)
    const pin = required(
      f.sqlite.prepare('SELECT * FROM featureTaskUploadEvidence').get(),
    )
    const grant = await readFeatureUploadAttachmentGrant(f.db, {
      ...common,
      proposalId: String(pin.proposalId),
    })
    expect(grant.pins.get(upload.imageId)).toBe(upload.imageRevisionId)
    expect(await f.db.get(sql`SELECT ${grant.guard} allowed`)).toEqual({ allowed: 1 })
    const head = required(
      f.sqlite.prepare("SELECT * FROM featureRevisionHead WHERE featureId='f'").get(),
    )
    const accepted = await acceptFeatureEditorialRevision(f.db, {
      ...common,
      actorId: 'reviewer',
      expectedScope,
      proposalId: String(pin.proposalId),
      expectedCandidateRevisionId: String(pin.candidateRevisionId),
      expectedPublishedRevisionId: String(head.publishedRevisionId),
      expectedGeneration: Number(head.generation),
      galleryAttachmentGuard: grant.guard,
      validateResult: (a, b) => validateFeatureGalleryResult(a, b, grant.pins),
      canReviewPath: () => true,
    })
    expect(accepted.status).toBe('accepted')
    expect(
      f.sqlite
        .prepare("SELECT isReviewed,reviewerId FROM task WHERE id='photo-task'")
        .get(),
    ).toEqual({ isReviewed: 1, reviewerId: 'reviewer' })
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('moves and deduplicates wishlists without copying or replacing visit history', async () => {
    const f = await identityFixture()
    const split = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Two sites',
          outputs: [
            { featureId: 'f', sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f' },
          ],
        },
      }),
    )
    const outputs = required(await readFeatureIdentityProposal(f.db, split)).plan
        .outputs,
      child = outputs[1].featureId
    await decideFeatureIdentityProposal(f.db, {
      ...f.command,
      proposalId: split,
      accept: true,
      reason: 'Reviewed',
      relationshipsReviewed: true,
      taskAssignments: [],
    })
    f.sqlite
      .prepare(
        "INSERT INTO userFeature VALUES('visitor',?,1,1,'child visit','child time','child created')",
      )
      .run(child)
    f.sqlite
      .prepare(
        "INSERT INTO userFeature VALUES('only-child',?,1,1,'original child visit','initial','initial')",
      )
      .run(child)
    const merge = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'merge',
          inputs: outputs.map(ref => ({ ...ref, generation: 1 })),
          reason: 'Duplicate',
          outputs: [{ featureId: 'f', sourceFeatureId: 'f' }],
        },
      }),
    )
    await decideFeatureIdentityProposal(f.db, {
      ...f.command,
      proposalId: merge,
      accept: true,
      reason: 'Reviewed',
      relationshipsReviewed: true,
      taskAssignments: [],
    })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM userFeature WHERE isWishlisted=1').get()
        ?.n,
    ).toBe(2)
    expect(
      f.sqlite
        .prepare(
          "SELECT isVisited,visitedAt,isWishlisted FROM userFeature WHERE userId='visitor' AND featureId='f'",
        )
        .get(),
    ).toEqual({ isVisited: 1, visitedAt: 'original visit', isWishlisted: 1 })
    expect(
      f.sqlite
        .prepare(
          "SELECT isVisited,visitedAt,isWishlisted FROM userFeature WHERE userId='only-child' AND featureId='f'",
        )
        .get(),
    ).toEqual({ isVisited: 0, visitedAt: null, isWishlisted: 1 })
    expect(
      f.sqlite
        .prepare(
          "SELECT isVisited,visitedAt,isWishlisted FROM userFeature WHERE userId='visitor' AND featureId=?",
        )
        .get(child),
    ).toEqual({ isVisited: 1, visitedAt: 'child visit', isWishlisted: 0 })
  })
  it.each(['task', 'photo', 'wishlist'])(
    'refuses stale %s evidence without moving work or publishing',
    async changed => {
      const f = await identityFixture()
      f.sqlite.exec(
        "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('open','f','project','org','author',0,0,'2026-01-01','reportedMissing')",
      )
      const id = required(
        await createFeatureIdentityProposal(f.db, {
          ...f.command,
          selection: {
            kind: 'split',
            inputs: [f.input],
            reason: 'Two',
            outputs: [
              { featureId: null, sourceFeatureId: 'f' },
              { featureId: null, sourceFeatureId: 'f' },
            ],
          },
        }),
      )
      const child = required(await readFeatureIdentityProposal(f.db, id)).plan
        .outputs[0].featureId
      if (changed === 'task')
        f.sqlite.exec("UPDATE task SET isReviewed=1 WHERE id='open'")
      if (changed === 'wishlist') f.sqlite.exec('UPDATE userFeature SET isWishlisted=0')
      if (changed === 'photo')
        f.sqlite.exec("INSERT INTO taskImage VALUES('open','photo')")
      const decision = decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: id,
        accept: true,
        reason: 'Stale',
        relationshipsReviewed: true,
        taskAssignments: [{ taskId: 'open', featureId: child }],
      })
      if (changed === 'photo')
        await expect(decision).rejects.toThrow(/legacy task photos/)
      else expect(await decision).toBeNull()
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureTaskTransfer').get()?.n,
      ).toBe(0)
      expect(required(await readFeatureIdentityProposal(f.db, id)).outcome).toBeNull()
      expect(
        f.sqlite.prepare("SELECT featureId FROM task WHERE id='open'").get()?.featureId,
      ).toBe('f')
    },
  )
  it('rolls back output publication and every relationship when a late task transfer fails', async () => {
    const f = await identityFixture()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('open','f','project','org','author',0,0,'2026-01-01','reportedMissing')",
    )
    const id = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Two',
          outputs: [
            { featureId: null, sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f' },
          ],
        },
      }),
    )
    const child = required(await readFeatureIdentityProposal(f.db, id)).plan.outputs[0]
      .featureId
    f.sqlite.exec(
      "CREATE TRIGGER fail_task_move BEFORE UPDATE OF featureId ON task BEGIN SELECT RAISE(ABORT,'late task failure'); END",
    )
    await expect(
      decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: id,
        accept: true,
        reason: 'Reviewed',
        relationshipsReviewed: true,
        taskAssignments: [{ taskId: 'open', featureId: child }],
      }),
    ).rejects.toThrow()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureTaskTransfer').get()?.n,
    ).toBe(0)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperation').get()?.n,
    ).toBe(0)
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId FROM featureRevisionHead WHERE featureId='f'",
        )
        .get()?.publishedRevisionId,
    ).toBe(f.baseline.revisionId)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
    ).toBe(0)
  })
  it('rejects moved new-Feature work without archiving its already-published destination', async () => {
    const f = await identityFixture()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('open','f','project','org','author',0,0,'2026-01-01','newFeature')",
    )
    const id = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Two',
          outputs: [
            { featureId: null, sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f' },
          ],
        },
      }),
    )
    const child = required(await readFeatureIdentityProposal(f.db, id)).plan.outputs[0]
      .featureId
    await decideFeatureIdentityProposal(f.db, {
      ...f.command,
      proposalId: id,
      accept: true,
      reason: 'Reviewed',
      relationshipsReviewed: true,
      taskAssignments: [{ taskId: 'open', featureId: child }],
    })
    const current = required(
        f.sqlite.prepare("SELECT * FROM task WHERE id='open'").get(),
      ),
      output = required(f.sqlite.prepare('SELECT * FROM feature WHERE id=?').get(child))
    expect(
      await commitTaskFeatureReview(f.db, {
        task: current,
        feature: output,
        reviewerId: 'reviewer',
        action: 'reject',
        resourceHubId: null,
        reason: 'Duplicate submission',
      } as never),
    ).toBe(true)
    expect(
      f.sqlite
        .prepare('SELECT isArchived,isPublished FROM feature WHERE id=?')
        .get(child),
    ).toEqual({ isArchived: 0, isPublished: 1 })
    expect(
      f.sqlite
        .prepare("SELECT isReviewed,reviewOutcome FROM task WHERE id='open'")
        .get(),
    ).toEqual({ isReviewed: 1, reviewOutcome: 'rejected' })
    expect(() =>
      f.sqlite.prepare("UPDATE task SET featureId='f' WHERE id='open'").run(),
    ).toThrow(/reviewed identity/)
  })
  it('keeps saved split guidance visible for retained and retired originals within the user and hub scope', async () => {
    const f = await identityFixture()
    const id = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Two',
          outputs: [
            { featureId: 'f', sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f' },
          ],
        },
      }),
    )
    await decideFeatureIdentityProposal(f.db, {
      ...f.command,
      proposalId: id,
      accept: true,
      reason: 'Reviewed',
      relationshipsReviewed: true,
      taskAssignments: [],
    })
    const query = { userId: 'visitor', hubId: null, isCore: true, offset: 0 }
    expect(
      (await readPublicFeatureSuccessors(f.db, { ...query, featureId: 'f' }))
        ?.retainsIdentity,
    ).toBe(true)
    const guidance = await readSavedFeatureSuccessors(f.db, query)
    expect(guidance.rows.map(row => row.id)).toEqual(['f'])
    expect(guidance.rows[0].successors).toHaveLength(2)
    expect(
      (await readSavedFeatureSuccessors(f.db, { ...query, userId: 'other-user' })).rows,
    ).toEqual([])
    expect(
      (
        await readSavedFeatureSuccessors(f.db, {
          ...query,
          isCore: false,
          hubId: 'other-hub',
        })
      ).rows,
    ).toEqual([])
    f.sqlite.exec('UPDATE layer SET isPublished=0')
    expect((await readSavedFeatureSuccessors(f.db, query)).rows).toEqual([])
  })
  it.each(['newPhoto', 'newFeature'])(
    'keeps moved %s drafts private until the contributor submits them',
    async type => {
      const f = await identityFixture()
      f.sqlite
        .prepare(
          "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES ('draft','f','project','org','author',1,0,'2026-01-01',?)",
        )
        .run(type)
      const uploaded = await saveFeatureImageUploadDraft(f.db, {
        ...common,
        taskIds: ['draft'],
        draftContributor: true,
        storageNamespace: 'local',
        storageKey: 'draft-upload',
        mediaType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]).buffer,
        intent: 'general',
        deriveMetadata: () => ({ version: 1, presentationMode: 'contain' }),
      })
      if (uploaded.status !== 'saved') throw new Error('Expected upload')
      const id = required(
        await createFeatureIdentityProposal(f.db, {
          ...f.command,
          selection: {
            kind: 'split',
            inputs: [f.input],
            reason: 'Two',
            outputs: [
              { featureId: null, sourceFeatureId: 'f' },
              { featureId: null, sourceFeatureId: 'f' },
            ],
          },
        }),
      )
      const child = required(await readFeatureIdentityProposal(f.db, id)).plan
        .outputs[0].featureId
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: id,
        accept: true,
        reason: 'Reviewed',
        relationshipsReviewed: true,
        taskAssignments: [{ taskId: 'draft', featureId: child }],
      })
      const evidence = required(
        f.sqlite.prepare('SELECT * FROM featureTaskUploadEvidence').get(),
      )
      expect(
        f.sqlite
          .prepare(
            'SELECT status,contributorId FROM featureRevisionProposal WHERE id=?',
          )
          .get(evidence.proposalId),
      ).toEqual({ status: 'draft', contributorId: 'author' })
      const grant = await readFeatureUploadAttachmentGrant(f.db, {
        ...common,
        featureId: child,
        proposalId: String(evidence.proposalId),
      })
      expect(await f.db.get(sql`SELECT ${grant.guard} allowed`)).toEqual({ allowed: 0 })
      const current = required(
        f.sqlite.prepare("SELECT * FROM task WHERE id='draft'").get(),
      )
      const output = required(
        f.sqlite.prepare('SELECT * FROM feature WHERE id=?').get(child),
      )
      if (type === 'newFeature')
        expect(
          await commitTaskFeatureDraftFinalization(f.db, {
            task: current,
            feature: output,
          } as never),
        ).toBe(true)
      else
        expect(await commitTaskDraftFinalization(f.db, current as never)).toBeTruthy()
      expect(
        f.sqlite
          .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
          .get(evidence.proposalId)?.status,
      ).toBe('submitted')
      expect(await f.db.get(sql`SELECT ${grant.guard} allowed`)).toEqual({ allowed: 1 })
      const snapshot = required(
        f.sqlite.prepare("SELECT * FROM task WHERE id='draft'").get(),
      )
      if (type === 'newFeature')
        expect(
          await commitTaskFeatureReview(f.db, {
            task: snapshot,
            feature: output,
            reviewerId: 'reviewer',
            action: 'reject',
            resourceHubId: null,
            reason: 'No longer relevant',
          } as never),
        ).toBe(true)
      else
        expect(
          await commitTaskImageReview(f.db, {
            task: snapshot,
            reviewerId: 'reviewer',
            action: 'reject',
            resourceHubId: null,
            reason: 'No longer relevant',
          } as never),
        ).toBe(true)
      expect(
        f.sqlite
          .prepare('SELECT isPublished,isArchived FROM feature WHERE id=?')
          .get(child),
      ).toEqual({ isPublished: 1, isArchived: 0 })
      expect(
        f.sqlite
          .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
          .get(evidence.proposalId)?.status,
      ).toBe('rejected')
    },
  )
  it('forwards shared upload evidence per task without withdrawing the branch still used by a retained task', async () => {
    const f = await identityFixture()
    for (const id of ['one', 'two'])
      f.sqlite
        .prepare(
          "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES (?,'f','project','org','author',1,0,'2026-01-01','newPhoto')",
        )
        .run(id)
    const uploaded = await saveFeatureImageUploadDraft(f.db, {
      ...common,
      taskIds: ['one', 'two'],
      draftContributor: true,
      storageNamespace: 'local',
      storageKey: 'shared-upload',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      intent: 'general',
      deriveMetadata: () => ({ version: 1, presentationMode: 'contain' }),
    })
    if (uploaded.status !== 'saved') throw new Error('Expected upload')
    await executeRevisionBatch(f.db, sql`1`, [
      ...(await prepareFeatureUploadSubmission(f.db, { ...common, taskId: 'one' })),
      f.db.update(task).set({ isDraft: false }).where(sql`1`),
    ])
    const id = required(
      await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Two',
          outputs: [
            { featureId: 'f', sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f' },
          ],
        },
      }),
    )
    const child = required(await readFeatureIdentityProposal(f.db, id)).plan.outputs[1]
      .featureId
    await decideFeatureIdentityProposal(f.db, {
      ...f.command,
      proposalId: id,
      accept: true,
      reason: 'Reviewed',
      relationshipsReviewed: true,
      taskAssignments: [
        { taskId: 'one', featureId: 'f' },
        { taskId: 'two', featureId: child },
      ],
    })
    expect(
      f.sqlite
        .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
        .get(uploaded.proposalId)?.status,
    ).toBe('submitted')
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureTaskUploadEvidence').get()?.n,
    ).toBe(2)
    const grant = await readFeatureUploadAttachmentGrant(f.db, {
      ...common,
      proposalId: uploaded.proposalId,
    })
    expect(await f.db.get(sql`SELECT ${grant.guard} allowed`)).toEqual({ allowed: 1 })
    const other = required(
      f.sqlite
        .prepare('SELECT proposalId FROM featureTaskUploadEvidence WHERE featureId=?')
        .get(child),
    )
    expect(other.proposalId).not.toBe(uploaded.proposalId)
    const terminal = {
      ...common,
      actorId: 'reviewer',
      proposalId: uploaded.proposalId,
      expectedCandidateRevisionId: uploaded.candidateRevisionId,
      reason: 'Duplicate',
    }
    expect(
      await rejectFeatureRevisionProposal(f.db, {
        ...terminal,
        decisionStatements: await prepareFeatureUploadTaskCompletion(f.db, terminal),
      }),
    ).toBe(true)
    expect(
      f.sqlite.prepare("SELECT isReviewed FROM task WHERE id='one'").get()?.isReviewed,
    ).toBe(1)
    expect(
      f.sqlite.prepare("SELECT isReviewed FROM task WHERE id='two'").get()?.isReviewed,
    ).toBe(0)
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it.each([false, true])(
    'reserves two private children and publishes a reviewed split atomically (linked=%s)',
    async linked => {
      const f = await identityFixture(linked)
      const proposalId = await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Distinct sites',
          outputs: [
            { featureId: null, sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f', images: [] },
          ],
        },
      })
      expect(proposalId).toBeTruthy()
      const proposal = required(
        await readFeatureIdentityProposal(f.db, required(proposalId)),
      )
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM feature WHERE isPublished=1').get(),
      ).toEqual({ n: 1 })
      const child = proposal.plan.outputs[0]
      expect(() =>
        f.sqlite
          .prepare(
            'UPDATE featureRevisionHead SET publishedRevisionId=? WHERE featureId=?',
          )
          .run(child.revisionId, child.featureId),
      ).toThrow(/reserved/)
      const result = await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(proposalId),
        accept: true,
        reason: 'Reviewed outputs',
        relationshipsReviewed: true,
        taskAssignments: [],
      })
      expect(result).toBeTruthy()
      expect(
        f.sqlite
          .prepare(
            "SELECT state,publishedRevisionId FROM featureRevisionHead WHERE featureId='f'",
          )
          .get(),
      ).toEqual({ state: 'split', publishedRevisionId: null })
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM feature WHERE isPublished=1').get(),
      ).toEqual({ n: 2 })
      expect(f.sqlite.prepare('SELECT * FROM userFeature').all()).toEqual([
        {
          userId: 'visitor',
          featureId: 'f',
          isVisited: 1,
          isWishlisted: 1,
          visitedAt: 'original visit',
          modifiedAt: 'initial',
          createdAt: 'initial',
        },
      ])
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get(),
      ).toEqual({ n: 0 })
      expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      if (linked)
        expect(
          f.sqlite
            .prepare('SELECT count(DISTINCT version) n FROM featureLocation')
            .get(),
        ).toEqual({ n: 2 })
      expect(
        f.sqlite
          .prepare("SELECT count(*) n FROM featureProperty WHERE featureId='f'")
          .get(),
      ).toEqual({ n: 0 })
      expect(
        f.sqlite
          .prepare("SELECT count(*) n FROM featureImage WHERE featureId='f'")
          .get(),
      ).toEqual({ n: 0 })
      const publicInput = { featureId: 'f', hubId: null, isCore: true }
      expect(
        (await readPublicFeatureSuccessors(f.db, publicInput))?.successors
          .map(row => row.id)
          .sort(),
      ).toEqual(proposal.plan.outputs.map(row => row.featureId).sort())
      const mergeInputs = proposal.plan.outputs.map(ref => ({ ...ref, generation: 1 }))
      const mergeId = await createFeatureIdentityProposal(f.db, {
        ...f.command,
        selection: {
          kind: 'merge',
          inputs: mergeInputs,
          reason: 'Duplicate children',
          outputs: [
            {
              featureId: child.featureId,
              sourceFeatureId: proposal.plan.outputs[1].featureId,
            },
          ],
        },
      })
      expect(
        await decideFeatureIdentityProposal(f.db, {
          ...f.command,
          proposalId: required(mergeId),
          accept: true,
          reason: 'Reviewed merge',
          relationshipsReviewed: true,
          taskAssignments: [],
        }),
      ).toBeTruthy()
      expect(
        (await readPublicFeatureSuccessors(f.db, publicInput))?.successors.map(
          row => row.id,
        ),
      ).toEqual([child.featureId])
      expect(
        await readPublicFeatureSuccessors(f.db, {
          ...publicInput,
          isCore: false,
          hubId: 'foreign-hub',
        }),
      ).toBeNull()
      f.sqlite.exec('UPDATE layer SET isPublished=0')
      expect(await readPublicFeatureSuccessors(f.db, publicInput)).toBeNull()
    },
  )
  it('merges a pending duplicate with its photo evidence and completes the task atomically', async () => {
    const f = await identityFixture()
    f.sqlite.exec(readFileSync('migrations/0187_feature_revision_creation.sql', 'utf8'))
    f.sqlite.exec('UPDATE featureRevisionCreationPolicy SET enabled=1')
    const created = await createFeatureForm(f.db, {
      data: FeatureInsert.parse({
        id: 'contribution',
        organisationId: 'org',
        projectId: 'project',
        layerId: 'layer',
        contributorId: 'contributor',
        geometry: { type: 'Point', coordinates: [114, 22] },
        isDraft: true,
        visitableAsOf: '2026-10-01',
      }),
      i18n: { en: { title: 'Duplicate with photo' } },
      properties: [],
      revisionActor: { actorId: 'contributor', mode: 'contribution' },
    })
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,modifiedAt,type) VALUES('initial-task','contribution','project','org','contributor',1,0,'2026-01-01T00:00:00.000Z','newFeature')",
    )
    const uploaded = await saveFeatureImageUploadDraft(f.db, {
      featureId: 'contribution',
      actorId: 'contributor',
      guard: sql`1`,
      storageNamespace: 'local',
      storageKey: 'duplicate-photo',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      taskIds: ['initial-task'],
      draftContributor: true,
      intent: 'general',
      deriveMetadata: () => ({ version: 1, presentationMode: 'contain' }),
    })
    if (uploaded.status !== 'saved') throw new Error('Missing upload')
    const token = String(
      required(
        f.sqlite.prepare("SELECT modifiedAt FROM task WHERE id='initial-task'").get(),
      ).modifiedAt,
    )
    expect(
      await commitTaskFeatureDraftFinalization(f.db, {
        task: {
          id: 'initial-task',
          featureId: 'contribution',
          contributorId: 'contributor',
          modifiedAt: token,
        },
        feature: created,
      }),
    ).toBe(true)
    const command = { ...f.command, contributionTaskId: 'initial-task' }
    const incoming = await inspectFeatureIdentitySource(f.db, {
      ...command,
      featureId: 'contribution',
    })
    const images = Object.keys(incoming.content.gallery.entries).map(imageId => ({
      imageId,
      sourceFeatureId: 'contribution',
    }))
    const proposalId = await createFeatureIdentityProposal(f.db, {
      ...command,
      selection: {
        kind: 'merge',
        reason: 'Duplicate',
        inputs: [
          f.input,
          {
            featureId: 'contribution',
            revisionId: incoming.revisionId,
            generation: incoming.generation,
          },
        ],
        outputs: [{ featureId: 'f', sourceFeatureId: 'f', images }],
      },
    })
    const completion = await prepareFeatureDuplicateReview(f.db, {
      taskId: 'initial-task',
      featureId: 'contribution',
      actorId: 'reviewer',
      imageIds: images.map(row => row.imageId),
    })
    const decision = {
      ...command,
      proposalId: required(proposalId),
      accept: true,
      reason: 'Duplicate',
      relationshipsReviewed: true as const,
      taskAssignments: [],
      preserveVisibility: true,
      completion,
    }
    f.sqlite.exec(
      "CREATE TRIGGER fail_duplicate_task BEFORE UPDATE ON task WHEN NEW.isReviewed=1 BEGIN SELECT RAISE(ABORT,'late duplicate task failure'); END",
    )
    await expect(decideFeatureIdentityProposal(f.db, decision)).rejects.toThrow()
    expect(
      f.sqlite.prepare("SELECT isArchived FROM feature WHERE id='contribution'").get()
        ?.isArchived,
    ).toBe(0)
    expect(
      f.sqlite.prepare("SELECT isReviewed FROM task WHERE id='initial-task'").get()
        ?.isReviewed,
    ).toBe(0)
    f.sqlite.exec('DROP TRIGGER fail_duplicate_task')
    expect(await decideFeatureIdentityProposal(f.db, decision)).toBeTruthy()
    expect(
      f.sqlite
        .prepare("SELECT isReviewed,reviewAction FROM task WHERE id='initial-task'")
        .get(),
    ).toEqual({ isReviewed: 1, reviewAction: 'merged-feature' })
    expect(
      f.sqlite
        .prepare("SELECT isPublished,isArchived FROM feature WHERE id='contribution'")
        .get(),
    ).toEqual({ isPublished: 0, isArchived: 1 })
    expect(
      f.sqlite.prepare("SELECT visitableAsOf FROM feature WHERE id='f'").get()
        ?.visitableAsOf,
    ).toBe(
      [
        f.baseline.content.profile.visitability.asOf,
        incoming.content.profile.visitability.asOf,
      ]
        .filter(Boolean)
        .sort()
        .at(-1),
    )
    const result = await inspectFeatureIdentitySource(f.db, {
      ...f.command,
      featureId: 'f',
    })
    expect(result.content.gallery.entries).toEqual(incoming.content.gallery.entries)
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('merges unpublished successors without publishing the primary', async () => {
    const f = await identityFixture()
    f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    f.sqlite.exec(
      readFileSync('migrations/0199_feature_private_merge_target.sql', 'utf8'),
    )
    const split = await createFeatureIdentityProposal(f.db, {
      ...f.command,
      selection: {
        kind: 'split',
        inputs: [f.input],
        reason: 'Split',
        outputs: [
          { featureId: null, sourceFeatureId: 'f' },
          { featureId: null, sourceFeatureId: 'f' },
        ],
      },
    })
    await decideFeatureIdentityProposal(f.db, {
      ...f.command,
      proposalId: required(split),
      accept: true,
      reason: 'Split',
      relationshipsReviewed: true,
      taskAssignments: [],
      preserveVisibility: true,
    })
    const children = required(await readFeatureIdentityProposal(f.db, required(split)))
      .plan.outputs
    const merge = await createFeatureIdentityProposal(f.db, {
      ...f.command,
      selection: {
        kind: 'merge',
        inputs: children.map(child => ({ ...child, generation: 1 })),
        reason: 'Merge',
        outputs: [
          { featureId: children[0].featureId, sourceFeatureId: children[0].featureId },
        ],
      },
    })
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(merge),
        accept: true,
        reason: 'Merge',
        relationshipsReviewed: true,
        taskAssignments: [],
        preserveVisibility: true,
      }),
    ).toBeTruthy()
    expect(
      f.sqlite
        .prepare('SELECT isPublished FROM feature WHERE id=?')
        .get(children[0].featureId)?.isPublished,
    ).toBe(0)
    expect(
      f.sqlite
        .prepare('SELECT isArchived FROM feature WHERE id=?')
        .get(children[1].featureId)?.isArchived,
    ).toBe(1)
    expect(
      await readPublicFeatureSuccessors(f.db, {
        featureId: children[1].featureId,
        hubId: null,
        isCore: true,
      }),
    ).toBeNull()
    expect(
      await routeFeatureRevisionPublication(f.db, {
        featureId: children[0].featureId,
        actorId: 'author',
        guard: sql`1`,
        state: true,
      }),
    ).toBe('updated')
    expect(
      (
        await readPublicFeatureSuccessors(f.db, {
          featureId: children[1].featureId,
          hubId: null,
          isCore: true,
        })
      )?.redirectFeatureId,
    ).toBe(children[0].featureId)
  })
  it('applies a staff split as editable unpublished successors and archives its source', async () => {
    const f = await identityFixture()
    f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    const proposalId = await createFeatureIdentityProposal(f.db, {
      ...f.command,
      selection: {
        kind: 'split',
        inputs: [f.input],
        reason: 'Two places',
        redirectOutputIndex: 0,
        outputs: [
          { featureId: null, sourceFeatureId: 'f' },
          { featureId: null, sourceFeatureId: 'f' },
        ],
      },
    })
    const proposal = required(
      await readFeatureIdentityProposal(f.db, required(proposalId)),
    )
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(proposalId),
        accept: true,
        reason: 'Split',
        relationshipsReviewed: true,
        taskAssignments: [],
        preserveVisibility: true,
      }),
    ).toBeTruthy()
    expect(
      f.sqlite.prepare("SELECT isPublished,isArchived FROM feature WHERE id='f'").get(),
    ).toEqual({ isPublished: 0, isArchived: 1 })
    for (const child of proposal.plan.outputs) {
      expect(
        f.sqlite
          .prepare('SELECT isPublished,isDraft,isArchived FROM feature WHERE id=?')
          .get(child.featureId),
      ).toEqual({ isPublished: 0, isDraft: 0, isArchived: 0 })
      const inspected = await inspectFeatureIdentitySource(f.db, {
        ...f.command,
        featureId: child.featureId,
      })
      expect(inspected.revisionId).toBe(child.revisionId)
      const capture = await prepareFeatureAcceptedCapture(f.db, {
        ...f.command,
        featureId: child.featureId,
        derive: content => content,
      })
      expect(
        await executeRevisionBatch(f.db, sql`1`, [...capture.before, ...capture.after]),
      ).not.toBeNull()
    }
    expect(
      await readPublicFeatureSuccessors(f.db, {
        featureId: 'f',
        hubId: null,
        isCore: true,
      }),
    ).toBeNull()
    const target = proposal.plan.outputs[0].featureId
    expect(
      await routeFeatureRevisionPublication(f.db, {
        featureId: target,
        actorId: 'author',
        guard: sql`1`,
        state: true,
      }),
    ).toBe('updated')
    expect(
      (
        await readPublicFeatureSuccessors(f.db, {
          featureId: 'f',
          hubId: null,
          isCore: true,
        })
      )?.redirectFeatureId,
    ).toBe(target)
  })
  it('stores the chosen split redirect and gates it on destination visibility without choosing the sibling', async () => {
    const f = await identityFixture()
    const proposalId = await createFeatureIdentityProposal(f.db, {
      ...f.command,
      selection: {
        kind: 'split',
        inputs: [f.input],
        reason: 'Two places',
        redirectOutputIndex: 0,
        outputs: [
          { featureId: null, sourceFeatureId: 'f' },
          { featureId: null, sourceFeatureId: 'f' },
        ],
      },
    })
    const proposal = required(
      await readFeatureIdentityProposal(f.db, required(proposalId)),
    )
    await decideFeatureIdentityProposal(f.db, {
      ...f.command,
      proposalId: required(proposalId),
      accept: true,
      reason: 'Split',
      relationshipsReviewed: true,
      taskAssignments: [],
    })
    const target = proposal.plan.outputs[0].featureId
    const query = { featureId: 'f', hubId: null, isCore: true }
    expect((await readPublicFeatureSuccessors(f.db, query))?.redirectFeatureId).toBe(
      target,
    )
    expect(
      await routeFeatureRevisionPublication(f.db, {
        featureId: target,
        actorId: 'author',
        guard: sql`1`,
        state: false,
      }),
    ).toBe('updated')
    expect(
      (await readPublicFeatureSuccessors(f.db, query))?.redirectFeatureId,
    ).toBeNull()
    expect((await readPublicFeatureSuccessors(f.db, query))?.successors).toHaveLength(1)
    expect(
      await routeFeatureRevisionPublication(f.db, {
        featureId: target,
        actorId: 'author',
        guard: sql`1`,
        state: true,
      }),
    ).toBe('updated')
    expect((await readPublicFeatureSuccessors(f.db, query))?.redirectFeatureId).toBe(
      target,
    )
  })
  it('retains the original as a split child and rejects sibling proposals after its head changes', async () => {
    const f = await identityFixture()
    const selection = {
      kind: 'split' as const,
      inputs: [f.input],
      reason: 'Two children',
      outputs: [
        { featureId: 'f', sourceFeatureId: 'f' },
        { featureId: null, sourceFeatureId: 'f' },
      ],
    }
    const first = await createFeatureIdentityProposal(f.db, { ...f.command, selection })
    const second = await createFeatureIdentityProposal(f.db, {
      ...f.command,
      selection,
    })
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(first),
        accept: true,
        reason: 'Reviewed',
        relationshipsReviewed: true,
        taskAssignments: [],
      }),
    ).toBeTruthy()
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(second),
        accept: true,
        reason: 'Stale',
        relationshipsReviewed: true,
        taskAssignments: [],
      }),
    ).toBeNull()
    expect(
      (await readFeatureIdentityProposal(f.db, required(second)))?.outcome,
    ).toBeNull()
  })
  it('rolls back decisions, projections, retirement and scopes after a late output failure', async () => {
    const f = await identityFixture()
    const id = await createFeatureIdentityProposal(f.db, {
      ...f.command,
      selection: {
        kind: 'split',
        inputs: [f.input],
        reason: 'Review',
        outputs: [
          { featureId: null, sourceFeatureId: 'f' },
          { featureId: null, sourceFeatureId: 'f' },
        ],
      },
    })
    f.sqlite.exec(
      `CREATE TRIGGER fail_identity_publication BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 AND NEW.featureId!='f' BEGIN SELECT RAISE(ABORT,'late identity failure'); END;`,
    )
    await expect(
      decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(id),
        accept: true,
        reason: 'Reviewed',
        relationshipsReviewed: true,
        taskAssignments: [],
      }),
    ).rejects.toThrow()
    expect((await readFeatureIdentityProposal(f.db, required(id)))?.outcome).toBeNull()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperation').get(),
    ).toEqual({ n: 0 })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get(),
    ).toEqual({ n: 0 })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM feature WHERE isPublished=1').get(),
    ).toEqual({ n: 1 })
  })
  it('refuses changed relationships and inaccessible internal content before deciding', async () => {
    const f = await identityFixture()
    await expect(
      createFeatureIdentityProposal(f.db, {
        ...f.command,
        allowedInternalIds: new Set(),
        selection: {
          kind: 'split',
          inputs: [f.input],
          reason: 'Review',
          outputs: [
            { featureId: null, sourceFeatureId: 'f' },
            { featureId: null, sourceFeatureId: 'f' },
          ],
        },
      }),
    ).rejects.toThrow(/internal/)
    const id = await createFeatureIdentityProposal(f.db, {
      ...f.command,
      selection: {
        kind: 'split',
        inputs: [f.input],
        reason: 'Review',
        outputs: [
          { featureId: null, sourceFeatureId: 'f' },
          { featureId: null, sourceFeatureId: 'f' },
        ],
      },
    })
    f.sqlite.exec('UPDATE userFeature SET isWishlisted=0')
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(id),
        accept: true,
        reason: 'Reviewed',
        relationshipsReviewed: true,
        taskAssignments: [],
      }),
    ).toBeNull()
    expect(
      await decideFeatureIdentityProposal(f.db, {
        ...f.command,
        proposalId: required(id),
        accept: false,
        reason: 'Inputs changed',
        relationshipsReviewed: true,
        taskAssignments: [],
      }),
    ).toBe(id)
    expect((await readFeatureIdentityProposal(f.db, required(id)))?.outcome).toBe(
      'rejected',
    )
  })
})

describe('approved private Feature maintenance', () => {
  it('captures edits when the private generation has no publication receipt', async () => {
    const f = fixture()
    f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    f.sqlite.exec("UPDATE feature SET isPublished=0,localIsPublished=0 WHERE id='f'")
    const baseline = await f.initialize(false)
    // Private edit-window reuse advances the head without creating a publication receipt.
    f.sqlite.exec("UPDATE featureRevisionHead SET generation=1 WHERE featureId='f'")
    f.sqlite
      .prepare(
        'INSERT INTO featurePrivateCapture(featureId,revisionId,generation) VALUES(?,?,1)',
      )
      .run('f', baseline.revisionId)
    const workspace = await readFeatureRevisionWorkspace(f.db, {
      ...common,
      canPublish: true,
    })
    expect(workspace.comparisonRevisionId).toBe(baseline.revisionId)
    const capture = await prepareFeatureAcceptedCapture(f.db, {
      ...common,
      derive: previous => {
        previous.profile.visitability.isVisitable = false
        return previous
      },
    })
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...capture.before,
        f.db.update(feature).set({ isVisitable: false }).where(sql`id='f'`),
        ...capture.after,
      ]),
    ).not.toBeNull()
    expect(
      f.sqlite
        .prepare("SELECT isPublished,isVisitable FROM feature WHERE id='f'")
        .get(),
    ).toEqual({ isPublished: 0, isVisitable: 0 })
    expect(
      f.sqlite
        .prepare('SELECT count(*) n FROM featureRevisionPublication WHERE generation=1')
        .get(),
    ).toEqual({ n: 0 })
    expect(
      (await readFeatureRevisionWorkspace(f.db, { ...common, canPublish: true }))
        .comparisonRevisionId,
    ).toBe(capture.revisionId)
  })

  it.each(['accepted', 'submitted', 'rejected', 'withdrawn'] as const)(
    'allows private gallery edits only after initial contribution acceptance (%s)',
    async status => {
      const f = fixture()
      f.sqlite.exec("UPDATE feature SET isPublished=0,localIsPublished=0 WHERE id='f'")
      const baseline = await f.initialize(false)
      const proposal = await f.proposal(baseline.revisionId, baseline.content)
      // Retained initial-contribution provenance must not freeze an accepted Feature.
      f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
      f.sqlite.exec(
        `CREATE TABLE featureInitialRevision(featureId TEXT,proposalId TEXT,mode TEXT)`,
      )
      f.sqlite
        .prepare("INSERT INTO featureInitialRevision VALUES('f',?,'contribution')")
        .run(proposal.proposalId)
      if (status !== 'submitted')
        f.sqlite
          .prepare('UPDATE featureRevisionProposal SET status=? WHERE id=?')
          .run(status, proposal.proposalId)
      f.sqlite.exec(
        readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
      )
      const edit = updateImageWithFeatureImage(
        f.db,
        {},
        { featureId: 'f', intent: 'general' },
        'photo',
        undefined,
        undefined,
        'reviewer',
      )
      if (status !== 'accepted') {
        await expect(edit).rejects.toThrow(
          'Submitted initial contributions are frozen for task review',
        )
        expect(
          f.sqlite.prepare('SELECT count(*) n FROM featurePrivateCapture').get(),
        ).toEqual({ n: 0 })
        return
      }
      await edit
      expect(
        f.sqlite
          .prepare(
            "SELECT intent,localIsPublished FROM featureImage WHERE featureId='f' AND imageId='photo'",
          )
          .get(),
      ).toEqual({ intent: 'general', localIsPublished: 1 })
      expect(
        f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get(),
      ).toEqual({ isPublished: 0 })
      expect(
        f.sqlite
          .prepare(`SELECT json_extract(r.content,'$.gallery.entries.photo.intent') intent,c.actorId
        FROM featurePrivateCapture p JOIN featureRevision r ON r.id=p.revisionId
        JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE p.featureId='f'`)
          .get(),
      ).toEqual({ intent: 'general', actorId: 'reviewer' })
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get(),
      ).toEqual({ n: 0 })
    },
  )

  it.each([false, true])(
    'records automation without publication, then merges explicit staff Publish (previously published=%s)',
    async previouslyPublished => {
      const f = fixture()
      f.sqlite.exec(
        readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
      )
      f.sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
      if (!previouslyPublished)
        f.sqlite.exec(
          "UPDATE feature SET isPublished=0,localIsPublished=0 WHERE id='f'",
        )
      const baseline = await f.initialize(previouslyPublished)
      if (previouslyPublished)
        expect(
          await unpublishFeatureRevision(f.db, {
            ...common,
            expectedPublishedRevisionId: baseline.revisionId,
            expectedGeneration: 0,
            projection: { statements: [], verify: sql`1` },
          }),
        ).toBe(true)
      const content = structuredClone(baseline.content)
      content.translations.en.title = { value: 'Staff translation', generated: false }
      const draft = await saveFeatureStaffDraft(f.db, {
        ...common,
        expectedScope,
        baseRevisionId: baseline.revisionId,
        content,
        validateResult: () => [],
      })
      expect(draft).toBeTruthy()
      const capture = await prepareFeatureAcceptedCapture(f.db, {
        ...common,
        actorId: 'policy:location',
        origin: 'system',
        reason: 'Approved private update',
        derive: previous => {
          const next = structuredClone(previous)
          next.profile.visitability.isVisitable = false
          return next
        },
      })
      expect(
        await executeRevisionBatch(f.db, sql`1`, [
          ...capture.before,
          f.db.update(feature).set({ isVisitable: false }).where(sql`id='f'`),
          ...capture.after,
        ]),
      ).not.toBeNull()
      expect(
        f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get(),
      ).toEqual({ isPublished: 0 })
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionPublication').get(),
      ).toEqual({ n: previouslyPublished ? 2 : 1 })
      const workspace = await readFeatureRevisionWorkspace(f.db, {
        ...common,
        canPublish: true,
      })
      expect(workspace.comparisonRevisionId).toBe(capture.revisionId)
      expect(workspace.publishedRevisionId).toBeNull()
      const result = await publishFeatureStaffDraft(f.db, {
        ...common,
        expectedScope,
        proposalId: required(draft).proposalId,
        expectedCandidateRevisionId: required(draft).candidateRevisionId,
        expectedPublishedRevisionId: null,
        expectedComparisonRevisionId: required(capture.revisionId),
        expectedGeneration: previouslyPublished ? 1 : 0,
        validateResult: () => [],
        canReviewPath: () => true,
      })
      expect(result.status).toBe('accepted')
      expect(
        f.sqlite
          .prepare("SELECT isVisitable,isPublished FROM feature WHERE id='f'")
          .get(),
      ).toEqual({ isVisitable: 0, isPublished: 1 })
      expect(
        f.sqlite
          .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
          .get(),
      ).toEqual({ title: 'Staff translation' })
    },
  )
})

it('records authored status changes while real historical routing moves only the derived layer', async () => {
  const f = fixture()
  f.sqlite.exec(
    "INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived,historicalSourceLayerId) VALUES('history','org','project',1,0,'layer'); UPDATE project SET flags='{\"showHistoricalLayers\":true}'",
  )
  const migration = readFileSync('migrations/0169_audit_column_order.sql', 'utf8')
  const trigger = migration.slice(
    migration.indexOf('CREATE TRIGGER historical_feature_update'),
    migration.indexOf('CREATE TRIGGER historical_layer_delete'),
  )
  f.sqlite.exec(trigger)
  f.sqlite.exec(
    readFileSync('migrations/0186_feature_revision_projection_guards.sql', 'utf8'),
  )
  const initial = await f.initialize()
  const stamp = String(
    f.sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()?.modifiedAt,
  )
  const result = await updateFeatureRevisionState(f.db, {
    ...common,
    updatedAt: stamp,
    data: { isIntangible: true },
  })
  expect(result).toMatchObject({
    status: 'updated',
    feature: { layerId: 'history', isIntangible: true },
  })
  const workspace = await readFeatureRevisionWorkspace(f.db, {
    ...common,
    canPublish: true,
  })
  expect(workspace.publishedRevisionId).not.toBe(initial.revisionId)
  const revision = required(
    f.sqlite
      .prepare('SELECT content FROM featureRevision WHERE id=?')
      .get(required(workspace.publishedRevisionId)),
  )
  expect(JSON.parse(String(revision.content)).profile.isIntangible).toBe(true)
})

it('keeps the legacy unlinked transfer and destination guard in one transaction', async () => {
  const f = fixture()
  f.sqlite.exec(
    "CREATE TABLE IF NOT EXISTS layerProperty(layerId TEXT,propertyId TEXT,isVisible INTEGER); INSERT INTO layerProperty SELECT 'destination-layer',id,1 FROM property WHERE id <> 'private'",
  )
  const destinationScope = {
    organisationId: 'org',
    projectId: 'destination-project',
    layerId: 'destination-layer',
    resourceHubId: null,
  }
  f.sqlite.exec(
    "INSERT INTO project(id,organisationId,isPublished,isArchived) VALUES('destination-project','org',1,0); INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived) VALUES('destination-layer','org','destination-project',1,0)",
  )
  const guard = sql`(${buildFeatureCommandScopeGuard(f.db, 'f', expectedScope)}) AND (${featureDestinationGuard(destinationScope)})`
  const saved = await saveUnlinkedFeatureForm(f.db, {
    featureId: 'f',
    projectId: 'project',
    actorId: 'owner',
    updatedAt: 'token',
    scopeGuard: guard,
    destinationScope,
    data: {
      projectId: 'destination-project',
      layerId: 'destination-layer',
      organisationId: 'org',
    },
    i18n: {},
  })
  expect(saved?.projectId).toBe('destination-project')
  expect(saved?.id).toBe('f')
  expect(
    f.sqlite
      .prepare(
        "SELECT propertyId FROM featureProperty WHERE featureId='f' AND propertyId='private'",
      )
      .get(),
  ).toBeUndefined()
  expect(
    f.sqlite
      .prepare(
        "SELECT propertyId FROM featurePropertyI18n WHERE featureId='f' AND propertyId='private'",
      )
      .get(),
  ).toBeUndefined()
})
