// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  DEFAULT_IMAGE_INTENTS,
  ImageIntentCatalogueSchema,
  resolveImageIntent,
} from '#lib/images/intents.js'
// SERVICES
import {
  readImageIntentPolicy,
  readFeatureImageIntentPolicy,
  saveImageIntentPolicy,
  prepareImageIntentGalleryChange,
  resolvePolicyImageIntent,
  normalizeAcceptedGalleryIntents,
} from '#lib/db/services/imageIntentPolicy.js'
import { readCurrentFeatureRevision } from '#lib/db/services/featureLifecycle.js'
import { saveFeatureImageUploadDraft } from '#lib/db/services/featureImageUploadRevision.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
// FIXTURES
import { lifecycleFixture } from './fixtures/featureLifecycle'

const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const fixture of connections.splice(0)) fixture.sqlite.close()
})
const command = { featureId: 'f', actorId: 'editor', guard: sql`1` }
const projectScope = { type: 'project' as const, id: 'project' }

async function fixture(published = true) {
  const f = lifecycleFixture()
  connections.push(f)
  f.sqlite.exec("INSERT INTO hub VALUES('core','core');")
  f.sqlite.exec(readFileSync('migrations/0200_image_intent_policies.sql', 'utf8'))
  await f.initialize(published)
  return f
}

async function save(
  f: ReturnType<typeof lifecycleFixture>,
  changes: Partial<Parameters<typeof saveImageIntentPolicy>[1]> = {},
) {
  const scope = changes.scope ?? projectScope
  const previous = await readImageIntentPolicy(f.db, scope)
  return saveImageIntentPolicy(f.db, {
    scope,
    actorId: 'editor',
    guard: sql`1`,
    version: previous.version,
    hubVersion: previous.hubVersion,
    intents: previous.intents,
    autoPublishUnclassified: true,
    reassignments: {},
    ...changes,
  })
}

async function upload(
  f: ReturnType<typeof lifecycleFixture>,
  intent = 'undefined',
  taskIds: string[] = [],
) {
  return saveFeatureImageUploadDraft(f.db, {
    ...command,
    storageNamespace: 'local',
    storageKey: `intent-upload-${crypto.randomUUID()}`,
    mediaType: 'image/jpeg',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    taskIds,
    draftContributor: taskIds.length > 0,
    intent,
    deriveMetadata: () => ({ version: 2, presentationMode: 'contain' }),
  })
}

describe('intent catalogue invariants', () => {
  it('permits renaming and reordering permanent roles but not deleting them', () => {
    const renamed = DEFAULT_IMAGE_INTENTS.map(intent => ({
      ...intent,
      label: `My ${intent.label}`,
    })).reverse()
    expect(ImageIntentCatalogueSchema.parse(renamed)).toEqual(renamed)
    for (const id of ['undefined', 'general', 'canonical'])
      expect(
        ImageIntentCatalogueSchema.safeParse(renamed.filter(intent => intent.id !== id))
          .success,
      ).toBe(false)
  })
  it('keeps Unclassified private and Catch-All public and rejects duplicate IDs', () => {
    expect(
      ImageIntentCatalogueSchema.safeParse(
        DEFAULT_IMAGE_INTENTS.map(intent => ({
          ...intent,
          isPublished: intent.id === 'undefined' || intent.isPublished,
        })),
      ).success,
    ).toBe(false)
    expect(
      ImageIntentCatalogueSchema.safeParse(
        DEFAULT_IMAGE_INTENTS.map(intent => ({
          ...intent,
          isPublished: intent.id !== 'general' && intent.isPublished,
        })),
      ).success,
    ).toBe(false)
    expect(
      ImageIntentCatalogueSchema.safeParse([
        ...DEFAULT_IMAGE_INTENTS,
        DEFAULT_IMAGE_INTENTS[0],
      ]).success,
    ).toBe(false)
    expect(resolveImageIntent(DEFAULT_IMAGE_INTENTS, 'undefined', true)).toEqual({
      intent: 'general',
      isPublished: true,
    })
    expect(() => resolveImageIntent(DEFAULT_IMAGE_INTENTS, 'unknown')).toThrow()
  })
})

describe('Hub and Project image policy', () => {
  it('defaults to Hub inheritance and automatic publication on, with independent copies for new Hubs', async () => {
    const f = await fixture()
    expect(await readImageIntentPolicy(f.db, projectScope)).toMatchObject({
      inherited: true,
      autoPublishUnclassified: true,
    })
    const custom = DEFAULT_IMAGE_INTENTS.map(intent => ({
      ...intent,
      label: intent.id === 'general' ? 'Gallery' : intent.label,
    }))
    await save(f, { scope: { type: 'hub', id: 'core' }, intents: custom })
    f.sqlite.exec("INSERT INTO hub VALUES('new','new')")
    expect(
      (await readImageIntentPolicy(f.db, { type: 'hub', id: 'new' })).intents,
    ).toEqual(custom)
    await save(f, {
      scope: { type: 'hub', id: 'core' },
      intents: [...DEFAULT_IMAGE_INTENTS],
    })
    expect(
      (await readImageIntentPolicy(f.db, { type: 'hub', id: 'new' })).intents,
    ).toEqual(custom)
  })
  it('isolates Project overrides and resumes inheritance explicitly', async () => {
    const f = await fixture()
    const custom = DEFAULT_IMAGE_INTENTS.map(intent => ({
      ...intent,
      label: `Project ${intent.label}`,
    }))
    await save(f, { intents: custom, autoPublishUnclassified: false })
    expect(await readImageIntentPolicy(f.db, projectScope)).toMatchObject({
      inherited: false,
      autoPublishUnclassified: false,
      intents: custom,
    })
    expect(
      (await readImageIntentPolicy(f.db, { type: 'hub', id: 'core' })).intents,
    ).toEqual(DEFAULT_IMAGE_INTENTS)
    await save(f, { intents: null })
    expect((await readImageIntentPolicy(f.db, projectScope)).inherited).toBe(true)
  })
  it('changes visibility with a new accepted revision while retaining the old snapshot', async () => {
    const f = await fixture()
    const before = (await readCurrentFeatureRevision(f.db, command))!
    await save(f, {
      intents: DEFAULT_IMAGE_INTENTS.map(intent => ({
        ...intent,
        isPublished: intent.id === 'research' || intent.isPublished,
      })),
    })
    const after = (await readCurrentFeatureRevision(f.db, command))!
    expect(after.revisionId).not.toBe(before.revisionId)
    expect(after.content.gallery.entries.research.isPublished).toBe(true)
    expect(
      JSON.parse(
        String(
          f.sqlite
            .prepare('SELECT content FROM featureRevision WHERE id=?')
            .get(before.revisionId)!.content,
        ),
      ).gallery.entries.research.isPublished,
    ).toBe(false)
    expect(
      f.sqlite
        .prepare("SELECT isPublished FROM featureImage WHERE imageId='research'")
        .get()?.isPublished,
    ).toBe(1)
  })
  it('reassigns removed intents without deleting images and retains aliases for old proposals', async () => {
    const f = await fixture()
    const intents = DEFAULT_IMAGE_INTENTS.filter(intent => intent.id !== 'research')
    await save(f, { intents, reassignments: { research: 'alternative' } })
    const policy = await readImageIntentPolicy(f.db, projectScope)
    expect(resolvePolicyImageIntent(policy, 'research')).toEqual({
      intent: 'alternative',
      isPublished: false,
    })
    expect(
      (await readCurrentFeatureRevision(f.db, command))?.content.gallery.entries
        .research.intent,
    ).toBe('alternative')
    expect(
      f.sqlite.prepare("SELECT count(*) n FROM image WHERE id='research'").get()?.n,
    ).toBe(1)
  })
  it('makes removed assignments Unclassified when no replacement is chosen, even with automation on', async () => {
    const f = await fixture()
    await save(f, {
      intents: DEFAULT_IMAGE_INTENTS.filter(intent => intent.id !== 'research'),
    })
    expect(
      (await readCurrentFeatureRevision(f.db, command))?.content.gallery.entries
        .research,
    ).toMatchObject({ intent: 'undefined', isPublished: false })
  })
  it('rolls back settings and assignments when accepted history cannot be written', async () => {
    const f = await fixture()
    f.sqlite.exec(
      "CREATE TRIGGER fail_intent_capture BEFORE INSERT ON featureRevision WHEN NEW.sequence>0 BEGIN SELECT RAISE(ABORT,'capture failed'); END",
    )
    await expect(
      save(f, {
        intents: DEFAULT_IMAGE_INTENTS.filter(intent => intent.id !== 'research'),
      }),
    ).rejects.toThrow()
    expect((await readImageIntentPolicy(f.db, projectScope)).inherited).toBe(true)
    expect(
      f.sqlite.prepare("SELECT intent FROM featureImage WHERE imageId='research'").get()
        ?.intent,
    ).toBe('research')
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM imageIntentPolicyRevision').get()?.n,
    ).toBe(0)
  })
  it('rejects stale settings versions', async () => {
    const f = await fixture()
    const before = await readImageIntentPolicy(f.db, projectScope)
    await save(f)
    expect(await save(f, { version: before.version })).toBe(false)
  })
})

describe('upload and publication behaviour', () => {
  it.each([true, false])(
    'automatically classifies staff uploads without overriding Feature visibility (%s)',
    async published => {
      const f = await fixture(published)
      const result = await upload(f)
      expect(result.status).toBe('accepted')
      if (result.status !== 'accepted') throw new Error('Upload not accepted')
      expect(
        f.sqlite
          .prepare(
            'SELECT intent,isPublished,localIsPublished FROM featureImage WHERE imageId=?',
          )
          .get(result.imageId),
      ).toEqual({
        intent: 'general',
        isPublished: Number(published),
        localIsPublished: 1,
      })
    },
  )
  it('keeps uploads unclassified when disabled and classifies only those images on explicit publication', async () => {
    const f = await fixture()
    await save(f, { intents: null, autoPublishUnclassified: false })
    const result = await upload(f)
    if (result.status !== 'accepted') throw new Error('Upload not accepted')
    expect(
      f.sqlite
        .prepare('SELECT intent,isPublished FROM featureImage WHERE imageId=?')
        .get(result.imageId),
    ).toEqual({ intent: 'undefined', isPublished: 0 })
    const policy = await readFeatureImageIntentPolicy(f.db, 'f')
    await executeRevisionBatch(
      f.db,
      policy.guard,
      await prepareImageIntentGalleryChange(f.db, {
        ...command,
        policy,
        classify: true,
      }),
    )
    const content = (await readCurrentFeatureRevision(f.db, command))!.content
    expect(content.gallery.entries[result.imageId]).toMatchObject({
      intent: 'general',
      isPublished: true,
    })
    expect(content.gallery.entries.research).toMatchObject({
      intent: 'research',
      isPublished: false,
    })
  })
  it('accepts a custom public intent without a manual visibility flag', async () => {
    const f = await fixture()
    await save(f, {
      intents: [
        ...DEFAULT_IMAGE_INTENTS,
        { id: 'entrance', label: 'Entrance', isPublished: true },
      ],
    })
    const result = await upload(f, 'entrance')
    if (result.status !== 'accepted') throw new Error('Upload not accepted')
    expect(
      (await readCurrentFeatureRevision(f.db, command))?.content.gallery.entries[
        result.imageId
      ],
    ).toMatchObject({ intent: 'entrance', isPublished: true })
  })
  it('keeps contributed uploads in review even when automatic publication is enabled', async () => {
    const f = await fixture()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed,type,modifiedAt) VALUES('contribution','f','project','org','editor',1,0,'newPhoto','now')",
    )
    const result = await upload(f, 'undefined', ['contribution'])
    expect(result.status).toBe('saved')
    if (result.status !== 'saved') throw new Error('Expected reviewed upload')
    expect(
      f.sqlite
        .prepare('SELECT imageId FROM featureImage WHERE imageId=?')
        .get(result.imageId),
    ).toBeUndefined()
  })
})

describe('legacy contribution publication boundary', () => {
  it('keeps pending private evidence private when its intent becomes public', async () => {
    const f = await fixture()
    f.sqlite.exec(
      "INSERT INTO task(id,featureId,isReviewed) VALUES('held','f',0); INSERT INTO taskImage VALUES('held','research')",
    )
    const current = (await readCurrentFeatureRevision(f.db, command))!
    const policy = await readFeatureImageIntentPolicy(f.db, 'f')
    policy.intents = policy.intents.map(intent => ({
      ...intent,
      isPublished: intent.id === 'research' || intent.isPublished,
    }))
    const normalized = await normalizeAcceptedGalleryIntents(
      f.db,
      'f',
      structuredClone(current.content),
      policy,
    )
    expect(normalized.gallery.entries.research.isPublished).toBe(false)
    f.sqlite.exec("UPDATE task SET isReviewed=1 WHERE id='held'")
    const approved = await normalizeAcceptedGalleryIntents(
      f.db,
      'f',
      structuredClone(current.content),
      policy,
    )
    expect(approved.gallery.entries.research.isPublished).toBe(true)
  })
})

describe('presentation-only intent saves', () => {
  it('reorders the Hub catalogue without reading galleries or recording revisions', async () => {
    const f = await fixture()
    const before = (await readCurrentFeatureRevision(f.db, command))!
    // A gallery query would enter the old per-Feature reconciliation path.
    const galleryReads = vi.spyOn(f.db, 'all').mockImplementation(() => {
      throw new Error('Unexpected gallery scan')
    })
    expect(
      await save(f, {
        scope: { type: 'hub', id: 'core' },
        intents: [...DEFAULT_IMAGE_INTENTS].reverse(),
      }),
    ).toBe(true)
    galleryReads.mockRestore()
    const policy = await readImageIntentPolicy(f.db, { type: 'hub', id: 'core' })
    expect(policy.intents.map(intent => intent.id)).toEqual(
      [...DEFAULT_IMAGE_INTENTS].reverse().map(intent => intent.id),
    )
    expect(policy.version).toBe(1)
    expect((await readCurrentFeatureRevision(f.db, command))?.revisionId).toBe(
      before.revisionId,
    )
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM imageIntentPolicyRevision').get()?.n,
    ).toBe(0)
    expect(
      await saveImageIntentPolicy(f.db, {
        scope: { type: 'hub', id: 'core' },
        actorId: 'editor',
        guard: sql`1`,
        version: 0,
        hubVersion: 0,
        intents: [...DEFAULT_IMAGE_INTENTS],
        autoPublishUnclassified: true,
        reassignments: {},
      }),
    ).toBe(false)
  })
  it('renames without scanning galleries but keeps the meaningful policy history', async () => {
    const f = await fixture()
    const galleryReads = vi.spyOn(f.db, 'all').mockImplementation(() => {
      throw new Error('Unexpected gallery scan')
    })
    expect(
      await save(f, {
        scope: { type: 'hub', id: 'core' },
        intents: DEFAULT_IMAGE_INTENTS.map(intent => ({
          ...intent,
          label: `My ${intent.label}`,
        })),
      }),
    ).toBe(true)
    galleryReads.mockRestore()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM imageIntentPolicyRevision').get()?.n,
    ).toBe(1)
  })
})

it('groups label-only settings edits but seals publication-policy changes', async () => {
  const f = await fixture()
  const migration = readFileSync('migrations/0203_revision_edit_windows.sql', 'utf8')
  f.sqlite.exec(
    migration.slice(
      migration.indexOf('DROP TRIGGER image_intent_history_no_update;'),
      migration.indexOf('CREATE TRIGGER feature_idle_upload_boundary'),
    ),
  )
  await save(f, {
    intents: DEFAULT_IMAGE_INTENTS.map(intent => ({
      ...intent,
      label: `First ${intent.label}`,
    })),
  })
  const first = f.sqlite
    .prepare('SELECT id FROM imageIntentPolicyRevision ORDER BY rowid DESC LIMIT 1')
    .get()!.id
  await save(f, {
    intents: DEFAULT_IMAGE_INTENTS.map(intent => ({
      ...intent,
      label: `Final ${intent.label}`,
    })),
  })
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM imageIntentPolicyRevision').get()?.n,
  ).toBe(1)
  expect(f.sqlite.prepare('SELECT id FROM imageIntentPolicyRevision').get()?.id).toBe(
    first,
  )
  await save(f, {
    intents: DEFAULT_IMAGE_INTENTS.map(intent => ({
      ...intent,
      isPublished: intent.id === 'research' || intent.isPublished,
    })),
  })
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM imageIntentPolicyRevision').get()?.n,
  ).toBe(2)
})
