// @vitest-environment node
import { afterEach, describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  readCurrentFeatureRevision,
  saveFeatureEdit,
  prepareFeatureEdit,
  createPartialFeatureProposal,
  acceptPartialFeatureProposal,
  rejectPartialFeatureProposal,
} from '#lib/db/services/featureLifecycle.js'
import { buildFeatureChanges } from '#lib/revisions/featureChanges.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
const command = { featureId: 'f', actorId: 'editor', guard: sql`1`, validate: () => [] }
async function fixture(published = true) {
  const f = lifecycleFixture()
  connections.push(f)
  return { ...f, initial: await f.initialize(published) }
}

describe('one accepted Feature history', () => {
  it.each([true, false])(
    'saves directly without changing visibility (%s)',
    async published => {
      const f = await fixture(published)
      const id = await saveFeatureEdit(f.db, {
        ...command,
        expectedRevisionId: f.initial.revisionId,
        expectedVersion: 0,
        derive: content => {
          content.translations.en.title.value = 'Direct edit'
          return content
        },
      })
      const current = await readCurrentFeatureRevision(f.db, command)
      expect(current).toMatchObject({
        revisionId: id,
        version: 1,
        state: { isPublished: published },
        content: { translations: { en: { title: { value: 'Direct edit' } } } },
      })
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
      ).toBe(0)
      expect(
        f.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('featureRevisionHead','featurePrivateCapture','featureRevisionPublication')",
          )
          .all(),
      ).toEqual([])
    },
  )
  it('records publish, unpublish, archive and restore as normal revisions', async () => {
    const f = await fixture(false)
    for (const state of [
      { isPublished: true },
      { isPublished: false },
      { isArchived: true },
      { isArchived: false },
    ]) {
      const current = (await readCurrentFeatureRevision(f.db, command))!
      const id = await saveFeatureEdit(f.db, {
        ...command,
        expectedRevisionId: current.revisionId,
        expectedVersion: current.version,
        state,
        derive: content => content,
      })
      expect(id).toBeTruthy()
      const stored = f.sqlite
        .prepare('SELECT recordState FROM featureRevision WHERE id=?')
        .get(id!)!
      expect(JSON.parse(String(stored.recordState))).toMatchObject(state)
    }
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(5)
  })
  it('rejects stale writes including visibility ABA changes', async () => {
    const f = await fixture()
    const prepared = (await prepareFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      derive: c => c,
    }))!
    const first = await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      state: { isPublished: false },
      derive: c => c,
    })
    await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: first!,
      expectedVersion: 1,
      state: { isPublished: true },
      derive: c => c,
    })
    expect(
      await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
    ).toBeNull()
    expect((await readCurrentFeatureRevision(f.db, command))?.version).toBe(2)
  })
  it('rolls content and visibility back if revision recording fails', async () => {
    const f = await fixture()
    f.sqlite.exec(
      "CREATE TRIGGER fail_revision BEFORE INSERT ON featureRevision WHEN NEW.sequence>0 BEGIN SELECT RAISE(ABORT,'revision failed'); END",
    )
    await expect(
      saveFeatureEdit(f.db, {
        ...command,
        expectedRevisionId: f.initial.revisionId,
        expectedVersion: 0,
        state: { isPublished: false },
        derive: c => {
          c.translations.en.title.value = 'Must roll back'
          return c
        },
      }),
    ).rejects.toThrow()
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      revisionId: f.initial.revisionId,
      version: 0,
      state: { isPublished: true },
    })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
    ).toBe(0)
  })
  it('stores partial proposals without candidate Feature revisions, then preserves unrelated edits', async () => {
    const f = await fixture(false),
      proposed = structuredClone(f.initial.content)
    proposed.translations.en.title.value = 'Contributed correction'
    const proposal = (await createPartialFeatureProposal(f.db, {
      ...command,
      baseRevisionId: f.initial.revisionId,
      changes: buildFeatureChanges(f.initial.content, proposed),
      submit: true,
    }))!
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(1)
    const staffId = await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      derive: c => {
        c.translations.en.description.value = 'Staff description'
        return c
      },
    })
    expect(
      await acceptPartialFeatureProposal(f.db, {
        ...command,
        proposalId: proposal.proposalId,
        expectedProposalVersion: proposal.version,
        expectedRevisionId: staffId!,
        expectedVersion: 1,
      }),
    ).toMatchObject({ status: 'accepted' })
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      state: { isPublished: false },
      content: {
        translations: {
          en: {
            title: { value: 'Contributed correction' },
            description: { value: 'Staff description' },
          },
        },
      },
    })
  })
  it('does not accept overlapping edits and leaves the proposal pending', async () => {
    const f = await fixture(),
      proposed = structuredClone(f.initial.content)
    proposed.translations.en.title.value = 'Contributor'
    const proposal = (await createPartialFeatureProposal(f.db, {
      ...command,
      baseRevisionId: f.initial.revisionId,
      changes: buildFeatureChanges(f.initial.content, proposed),
      submit: true,
    }))!
    const staff = await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      derive: c => {
        c.translations.en.title.value = 'Staff'
        return c
      },
    })
    expect(
      await acceptPartialFeatureProposal(f.db, {
        ...command,
        proposalId: proposal.proposalId,
        expectedProposalVersion: proposal.version,
        expectedRevisionId: staff!,
        expectedVersion: 1,
      }),
    ).toMatchObject({ status: 'conflict' })
    expect(
      f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get()?.status,
    ).toBe('submitted')
  })
  it('retains rejected evidence without creating an accepted revision', async () => {
    const f = await fixture(),
      proposed = structuredClone(f.initial.content)
    proposed.translations.en.title.value = 'Rejected'
    const proposal = (await createPartialFeatureProposal(f.db, {
      ...command,
      baseRevisionId: f.initial.revisionId,
      changes: buildFeatureChanges(f.initial.content, proposed),
      submit: true,
    }))!
    expect(
      await rejectPartialFeatureProposal(f.db, {
        ...command,
        ...proposal,
        expectedProposalVersion: proposal.version,
        reason: 'Incorrect name',
      }),
    ).toBe(true)
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(1)
    expect(
      f.sqlite
        .prepare("SELECT count(*) n FROM featureRevisionReview WHERE action='rejected'")
        .get()?.n,
    ).toBe(1)
  })
})

// Direct identity operations deliberately share the accepted-edit transaction machinery.
import {
  splitLifecycleFeature,
  mergeLifecycleFeatures,
} from '#lib/db/services/featureLifecycleIdentity.js'
describe('direct lifecycle identity operations', () => {
  it('copies two unpublished successors and retains exact lineage and immutable photo pins', async () => {
    const f = await fixture()
    const result = await splitLifecycleFeature(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      titles: ['Left sign', 'Right sign'],
      guard: sql`EXISTS(SELECT 1 FROM feature WHERE id='f' AND isArchived=0)`,
      locale: 'en',
      redirectIndex: 1,
    })
    expect(result).not.toBeNull()
    const source = await readCurrentFeatureRevision(f.db, command)
    expect(source).toMatchObject({
      retired: true,
      state: { isArchived: true, isPublished: false },
    })
    for (const [index, featureId] of result!.featureIds.entries()) {
      const child = await readCurrentFeatureRevision(f.db, { featureId, guard: sql`1` })
      expect(child).toMatchObject({
        version: 0,
        retired: false,
        state: { isPublished: false, isArchived: false },
        content: {
          translations: {
            en: { title: { value: index ? 'Right sign' : 'Left sign' } },
          },
        },
      })
      expect(child?.content.gallery).toEqual(f.initial.content.gallery)
      expect(child?.content.properties).toEqual(f.initial.content.properties)
    }
    expect(
      JSON.parse(
        String(
          f.sqlite.prepare('SELECT dispositions FROM featureIdentityOperation').get()
            ?.dispositions,
        ),
      ),
    ).toEqual({ redirectFeatureId: result!.featureIds[1] })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperationMember').get()
        ?.n,
    ).toBe(3)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
    ).toBe(0)
    await expect(
      saveFeatureEdit(f.db, {
        ...command,
        expectedRevisionId: source!.revisionId,
        expectedVersion: source!.version,
        state: { isArchived: false },
        derive: c => c,
      }),
    ).rejects.toThrow('Retired')
  })
  it('rolls the entire split back when a child fails', async () => {
    const f = await fixture()
    f.sqlite.exec(
      "CREATE TRIGGER fail_child BEFORE INSERT ON feature WHEN NEW.id!='f' BEGIN SELECT RAISE(ABORT,'child failed'); END",
    )
    await expect(
      splitLifecycleFeature(f.db, {
        ...command,
        expectedRevisionId: f.initial.revisionId,
        expectedVersion: 0,
        titles: ['Left', 'Right'],
        locale: 'en',
        redirectIndex: null,
      }),
    ).rejects.toThrow()
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(1)
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      revisionId: f.initial.revisionId,
      version: 0,
      state: { isPublished: true, isArchived: false },
    })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperation').get()?.n,
    ).toBe(0)
  })
  it('merges into the primary without publishing it and rejects reuse of retired identities', async () => {
    const f = await fixture()
    const split = (await splitLifecycleFeature(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      titles: ['Left', 'Right'],
      locale: 'en',
      redirectIndex: null,
    }))!
    const primary = (await readCurrentFeatureRevision(f.db, {
      featureId: split.featureIds[0],
      guard: sql`1`,
    }))!
    const secondary = (await readCurrentFeatureRevision(f.db, {
      featureId: split.featureIds[1],
      guard: sql`1`,
    }))!
    const merge = {
      ...command,
      featureId: primary.featureId,
      expectedRevisionId: primary.revisionId,
      expectedVersion: 0,
      secondary: {
        featureId: secondary.featureId,
        expectedRevisionId: secondary.revisionId,
        expectedVersion: 0,
        guard: sql`1`,
      },
      derive: (c: typeof primary.content) => {
        c.translations.en.title.value = 'Combined'
        return c
      },
    }
    expect(await mergeLifecycleFeatures(f.db, merge)).toBeTruthy()
    expect(
      await readCurrentFeatureRevision(f.db, {
        ...command,
        featureId: primary.featureId,
      }),
    ).toMatchObject({
      retired: false,
      state: { isPublished: false, isArchived: false },
      content: { translations: { en: { title: { value: 'Combined' } } } },
    })
    expect(
      await readCurrentFeatureRevision(f.db, {
        ...command,
        featureId: secondary.featureId,
      }),
    ).toMatchObject({ retired: true, state: { isPublished: false, isArchived: true } })
    expect(await mergeLifecycleFeatures(f.db, merge)).toBeNull()
  })
})

import {
  createFeatureCreationProposal,
  saveFeatureContributionDraft,
  acceptFeatureCreationProposal,
} from '#lib/db/services/featureLifecycleContribution.js'
describe('creation contributions without provisional identities', () => {
  it('saves and submits a proposal, then creates one complete unpublished record on acceptance', async () => {
    const f = await fixture(),
      current = (await readCurrentFeatureRevision(f.db, command))!
    const proposal = (await createFeatureCreationProposal(f.db, {
      ...command,
      scope: {
        organisationId: current.state.organisationId,
        projectId: current.state.projectId,
        layerId: current.state.layerId,
      },
      content: current.content,
    }))!
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(1)
    expect(
      f.sqlite.prepare('SELECT featureId FROM featureRevisionProposal').get()
        ?.featureId,
    ).toBeNull()
    const content = structuredClone(current.content)
    content.translations.en.title.value = 'New contribution'
    const version = await saveFeatureContributionDraft(f.db, {
      ...command,
      proposalId: proposal.proposalId,
      expectedVersion: proposal.version,
      payload: { format: 'feature-create/v1', content },
      submit: true,
      validate: () => [],
    })
    expect(version).toBeTruthy()
    expect(
      await saveFeatureContributionDraft(f.db, {
        ...command,
        proposalId: proposal.proposalId,
        expectedVersion: version!,
        payload: { format: 'feature-create/v1', content },
        validate: () => [],
      }),
    ).toBeNull()
    const accepted = await acceptFeatureCreationProposal(f.db, {
      ...command,
      proposalId: proposal.proposalId,
      expectedVersion: version!,
      validate: () => [],
    })
    expect(accepted).not.toBeNull()
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(2)
    expect(
      await readCurrentFeatureRevision(f.db, {
        ...command,
        featureId: accepted!.featureId,
      }),
    ).toMatchObject({
      state: { isPublished: false, isArchived: false },
      content: { translations: { en: { title: { value: 'New contribution' } } } },
    })
  })
  it('adopts a duplicate into the existing identity with no merge operation or extra record', async () => {
    const f = await fixture(),
      current = (await readCurrentFeatureRevision(f.db, command))!
    const proposal = (await createFeatureCreationProposal(f.db, {
      ...command,
      scope: {
        organisationId: current.state.organisationId,
        projectId: current.state.projectId,
        layerId: current.state.layerId,
      },
      content: current.content,
      submit: true,
    }))!
    const result = await acceptFeatureCreationProposal(f.db, {
      ...command,
      proposalId: proposal.proposalId,
      expectedVersion: proposal.version,
      validate: () => [],
      duplicate: {
        ...command,
        expectedRevisionId: current.revisionId,
        expectedVersion: 0,
        derive: c => {
          c.translations.en.description.value = 'Contributed evidence'
          return c
        },
      },
    })
    expect(result?.featureId).toBe('f')
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(1)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperation').get()?.n,
    ).toBe(0)
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      state: { isPublished: true },
      content: {
        translations: { en: { description: { value: 'Contributed evidence' } } },
      },
    })
  })
  it('rolls back creation and review if task completion fails', async () => {
    const f = await fixture(),
      current = (await readCurrentFeatureRevision(f.db, command))!
    const proposal = (await createFeatureCreationProposal(f.db, {
      ...command,
      scope: {
        organisationId: current.state.organisationId,
        projectId: current.state.projectId,
        layerId: current.state.layerId,
      },
      content: current.content,
      submit: true,
    }))!
    const { prepareRevisionCheck } = await import('#lib/db/services/revisionBatch.js')
    await expect(
      acceptFeatureCreationProposal(f.db, {
        ...command,
        proposalId: proposal.proposalId,
        expectedVersion: proposal.version,
        validate: () => [],
        completion: () => [prepareRevisionCheck(f.db, sql`0`)],
      }),
    ).resolves.toBeNull()
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(1)
    expect(
      f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get()?.status,
    ).toBe('submitted')
  })
  it('records explicit conflict choices while preserving unrelated staff edits', async () => {
    const f = await fixture(),
      proposed = structuredClone(f.initial.content)
    proposed.translations.en.title.value = 'Contributor'
    const proposal = (await createPartialFeatureProposal(f.db, {
      ...command,
      baseRevisionId: f.initial.revisionId,
      changes: buildFeatureChanges(f.initial.content, proposed),
      submit: true,
    }))!
    const staff = await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      derive: c => {
        c.translations.en.title.value = 'Staff'
        c.translations.en.description.value = 'Keep this'
        return c
      },
    })
    const resolutions = [
      {
        path: ['translations', 'en', 'title'],
        result: {
          present: true as const,
          value: { value: 'Reviewed title', generated: false },
        },
      },
    ]
    expect(
      await acceptPartialFeatureProposal(f.db, {
        ...command,
        proposalId: proposal.proposalId,
        expectedProposalVersion: proposal.version,
        expectedRevisionId: staff!,
        expectedVersion: 1,
        resolutions,
      }),
    ).toMatchObject({ status: 'accepted' })
    expect(
      JSON.parse(
        String(
          f.sqlite
            .prepare(
              "SELECT resolutions FROM featureRevisionReview WHERE action='accepted'",
            )
            .get()?.resolutions,
        ),
      ),
    ).toEqual(resolutions)
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      content: {
        translations: {
          en: {
            title: { value: 'Reviewed title' },
            description: { value: 'Keep this' },
          },
        },
      },
    })
  })
})

import { readLifecycleSuccessors } from '#lib/db/services/featureLifecycleRead.js'
describe('effective lifecycle redirects', () => {
  it('activates only the chosen published successor and rechecks publication and hub gates', async () => {
    const f = await fixture(),
      split = (await splitLifecycleFeature(f.db, {
        ...command,
        expectedRevisionId: f.initial.revisionId,
        expectedVersion: 0,
        titles: ['Left', 'Right'],
        locale: 'en',
        redirectIndex: 1,
      }))!
    const query = { featureId: 'f', hubId: null, isCore: true }
    expect(await readLifecycleSuccessors(f.db, query)).toBeNull()
    const publish = async (featureId: string, isPublished: boolean) => {
      const current = (await readCurrentFeatureRevision(f.db, {
        featureId,
        guard: sql`1`,
      }))!
      return saveFeatureEdit(f.db, {
        ...command,
        featureId,
        expectedRevisionId: current.revisionId,
        expectedVersion: current.version,
        state: { isPublished },
        derive: c => c,
      })
    }
    await publish(split.featureIds[0], true)
    expect(await readLifecycleSuccessors(f.db, query)).toMatchObject({
      redirectFeatureId: null,
      successors: [{ id: split.featureIds[0] }],
    })
    await publish(split.featureIds[1], true)
    expect(await readLifecycleSuccessors(f.db, query)).toMatchObject({
      redirectFeatureId: split.featureIds[1],
    })
    f.sqlite.exec('UPDATE project SET isPublished=0')
    expect(await readLifecycleSuccessors(f.db, query)).toBeNull()
    f.sqlite.exec(
      "UPDATE project SET isPublished=1; UPDATE organisation SET hubId='private-hub',isHubExclusive=1",
    )
    expect(await readLifecycleSuccessors(f.db, query)).toBeNull()
    expect(
      await readLifecycleSuccessors(f.db, {
        ...query,
        isCore: false,
        hubId: 'private-hub',
      }),
    ).toMatchObject({ redirectFeatureId: split.featureIds[1] })
    await publish(split.featureIds[1], false)
    expect(
      await readLifecycleSuccessors(f.db, {
        ...query,
        isCore: false,
        hubId: 'private-hub',
      }),
    ).toMatchObject({ redirectFeatureId: null })
  })
})

import { saveLifecycleImageChange } from '#lib/db/services/featureLifecycleImage.js'
describe('immutable image files in accepted lifecycle history', () => {
  it('reuses bytes for metadata edits, retains old object references on replacement and preserves old Feature pins', async () => {
    const f = await fixture()
    const metadata = await saveLifecycleImageChange(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      imageId: 'photo',
      expectedImageRevisionId: 'image-r1',
      deriveMetadata: m => ({ ...m, credit: 'Photographer' }),
    })
    expect(metadata).not.toBeNull()
    expect(metadata?.assetVersionId).toBe('asset-photo')
    expect(f.sqlite.prepare('SELECT count(*) n FROM imageAssetVersion').get()?.n).toBe(
      2,
    )
    const replacement = await saveLifecycleImageChange(f.db, {
      ...command,
      expectedRevisionId: metadata!.revisionId,
      expectedVersion: 1,
      imageId: 'photo',
      expectedImageRevisionId: metadata!.imageRevisionId,
      deriveMetadata: m => ({ ...m, version: 2 }),
      replacement: {
        storageNamespace: 'local',
        storageKey: 'new-immutable-photo',
        contentHash: 'b'.repeat(64),
        mediaType: 'image/jpeg',
        byteSize: 200,
      },
    })
    expect(replacement).not.toBeNull()
    expect(
      f.sqlite
        .prepare('SELECT storageKey FROM imageAssetVersion WHERE id=?')
        .get('asset-photo')?.storageKey,
    ).toBe('immutable-photo')
    expect(f.sqlite.prepare('SELECT count(*) n FROM imageAssetVersion').get()?.n).toBe(
      3,
    )
    expect(
      f.sqlite
        .prepare(
          'SELECT imageRevisionId FROM featureRevisionImage WHERE featureRevisionId=? AND imageId=?',
        )
        .get(f.initial.revisionId, 'photo')?.imageRevisionId,
    ).toBe('image-r1')
    expect(
      f.sqlite
        .prepare(
          'SELECT imageRevisionId FROM featureRevisionImage WHERE featureRevisionId=? AND imageId=?',
        )
        .get(replacement!.revisionId, 'photo')?.imageRevisionId,
    ).toBe(replacement!.imageRevisionId)
    expect(() =>
      f.sqlite.prepare('DELETE FROM imageAssetVersion WHERE id=?').run('asset-photo'),
    ).toThrow()
  })
  it('rejects overwriting the original immutable file key', async () => {
    const f = await fixture()
    await expect(
      saveLifecycleImageChange(f.db, {
        ...command,
        expectedRevisionId: f.initial.revisionId,
        expectedVersion: 0,
        imageId: 'photo',
        expectedImageRevisionId: 'image-r1',
        deriveMetadata: m => m,
        replacement: {
          storageNamespace: 'local',
          storageKey: 'immutable-photo',
          contentHash: 'b'.repeat(64),
          mediaType: 'image/jpeg',
          byteSize: 200,
        },
      }),
    ).rejects.toThrow('new immutable object key')
    expect(f.sqlite.prepare('SELECT count(*) n FROM imageAssetVersion').get()?.n).toBe(
      2,
    )
  })
})

import { prepareFeatureAcceptedCapture } from '#lib/db/services/featureAcceptedCapture.js'
import { routeFeatureRevisionPublication } from '#lib/db/services/featureRevisionPublication.js'
import { featureI18n } from '#lib/db/schema/feature.js'
import { and, eq } from 'drizzle-orm'
describe('existing editor adapters after lifecycle cutover', () => {
  it('routes ordinary content capture and publication controls to the sole accepted history', async () => {
    const f = await fixture(false)
    const capture = await prepareFeatureAcceptedCapture(f.db, {
      ...command,
      derive: c => {
        c.translations.en.title.value = 'Ordinary editor'
        return c
      },
    })
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...capture.before,
        f.db
          .update(featureI18n)
          .set({ title: 'Ordinary editor' })
          .where(and(eq(featureI18n.featureId, 'f'), eq(featureI18n.locale, 'en'))),
        ...capture.after,
      ]),
    ).toBeTruthy()
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      version: 1,
      state: { isPublished: false },
      content: { translations: { en: { title: { value: 'Ordinary editor' } } } },
    })
    expect(
      await routeFeatureRevisionPublication(f.db, { ...command, state: true }),
    ).toBe('updated')
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      version: 2,
      state: { isPublished: true },
    })
    expect(
      await routeFeatureRevisionPublication(f.db, { ...command, state: false }),
    ).toBe('updated')
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      version: 3,
      state: { isPublished: false },
    })
  })
})

it('gives split children independent names and bindings while ending source Location subscriptions', async () => {
  const f = lifecycleFixture(true)
  connections.push(f)
  const initial = await f.initialize()
  const result = (await splitLifecycleFeature(f.db, {
    ...command,
    expectedRevisionId: initial.revisionId,
    expectedVersion: 0,
    titles: ['First', 'Second'],
    locale: 'en',
    redirectIndex: null,
  }))!
  expect(result).toBeTruthy()
  expect(
    f.sqlite.prepare("SELECT count(*) n FROM featureLocation WHERE featureId='f'").get()
      ?.n,
  ).toBe(0)
  expect(
    f.sqlite.prepare("SELECT count(*) n FROM featureImage WHERE featureId='f'").get()
      ?.n,
  ).toBe(0)
  const children = await Promise.all(
    result.featureIds.map(featureId =>
      readCurrentFeatureRevision(f.db, { featureId, guard: sql`1` }),
    ),
  )
  expect(children[0]?.content.placement.location?.associationVersion).not.toBe(
    children[1]?.content.placement.location?.associationVersion,
  )
  for (const child of children) {
    expect(child?.content.placement.location?.locationId).toBe(
      initial.content.placement.location?.locationId,
    )
    expect(child?.content.placement.location?.acceptancePolicy?.nameMode).toBe(
      'independent',
    )
  }
})

import {
  prepareFeatureContributionTask,
  prepareFeatureContributionTaskCompletion,
} from '#lib/db/services/featureLifecycleTask.js'
import { taskLifecycleScopeCondition } from '#lib/db/services/task-scope.js'
import { hasFeatureTaskTransfer } from '#lib/db/services/featureUploadEvidence.js'
import { reviewInitialFeatureContribution } from '#lib/db/services/featureInitialReview.js'
import { getTaskHubFilter } from '#lib/db/services/hub.js'
it.each([true, false])(
  'reviews migrated initial contributions atomically (accept=%s)',
  async accept => {
    const f = await fixture(false),
      proposed = structuredClone(f.initial.content)
    proposed.translations.en.title.value = 'Initial contribution'
    const proposal = (await createPartialFeatureProposal(f.db, {
      ...command,
      baseRevisionId: f.initial.revisionId,
      changes: buildFeatureChanges(f.initial.content, proposed),
      submit: false,
      attachTask: proposalId =>
        prepareFeatureContributionTask(f.db, {
          taskId: 'legacy-task',
          proposalId,
          featureId: 'f',
          organisationId: 'org',
          projectId: 'project',
          actorId: 'editor',
          type: 'newFeature',
          submitted: false,
        }),
    }))!
    f.sqlite
      .prepare(
        "UPDATE featureRevisionProposal SET creationScope=?,status='submitted' WHERE id=?",
      )
      .run(
        JSON.stringify({ legacyInitial: { mode: 'contribution' } }),
        proposal.proposalId,
      )
    f.sqlite.exec("UPDATE task SET isDraft=0 WHERE id='legacy-task'")
    await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: f.initial.revisionId,
      expectedVersion: 0,
      derive: content => {
        content.translations.en.description.value = 'Later staff edit'
        return content
      },
    })
    const task = f.sqlite.prepare("SELECT * FROM task WHERE id='legacy-task'").get()!
    const input = {
      ...command,
      taskId: 'legacy-task',
      accept,
      reason: 'Reviewed initial contribution',
      completion: prepareFeatureContributionTaskCompletion(f.db, {
        taskId: 'legacy-task',
        proposalId: proposal.proposalId,
        expectedModifiedAt: String(task.modifiedAt),
        actorId: 'editor',
        guard: sql`1`,
        featureId: 'f',
        outcome: accept ? 'accepted' : 'rejected',
        action: accept ? 'added-feature' : 'ignored',
        reason: 'Reviewed initial contribution',
      }),
    }
    expect(
      await reviewInitialFeatureContribution(f.db, { ...input, guard: sql`0` }),
    ).toBe(false)
    expect(await reviewInitialFeatureContribution(f.db, input)).toBe(true)
    expect(await reviewInitialFeatureContribution(f.db, input)).toBe(false)
    expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
      state: { isPublished: false, isArchived: !accept },
      content: {
        translations: {
          en: {
            title: {
              value: accept
                ? 'Initial contribution'
                : f.initial.content.translations.en.title.value,
            },
            description: { value: 'Later staff edit' },
          },
        },
      },
    })
    expect(
      f.sqlite.prepare("SELECT isReviewed FROM task WHERE id='legacy-task'").get()
        ?.isReviewed,
    ).toBe(1)
  },
)
it('routes a creation proposal through a task without a provisional Feature row', async () => {
  const f = await fixture(),
    current = (await readCurrentFeatureRevision(f.db, command))!
  const scope = {
    organisationId: current.state.organisationId,
    projectId: current.state.projectId,
    layerId: current.state.layerId,
  }
  const proposal = (await createFeatureCreationProposal(f.db, {
    ...command,
    scope,
    content: current.content,
    submit: true,
    attachTask: proposalId =>
      prepareFeatureContributionTask(f.db, {
        taskId: 'new-task',
        proposalId,
        featureId: null,
        ...scope,
        actorId: 'editor',
        type: 'newFeature',
        submitted: true,
      }),
  }))!
  const task = f.sqlite.prepare("SELECT * FROM task WHERE id='new-task'").get()!
  expect(task.featureId).toBeNull()
  expect(task.proposalId).toBe(proposal.proposalId)
  const scopeCondition = await taskLifecycleScopeCondition(f.db)
  expect(
    await f.db.get(
      sql`SELECT id FROM task WHERE id='new-task' AND (${scopeCondition})`,
    ),
  ).toBeTruthy()
  const coreHub = getTaskHubFilter(f.db, {
    isCore: true,
    i18n: {},
    isSuperAdmin: false,
    isAdminRequest: false,
  })!
  expect(
    await f.db.get(
      sql`SELECT id FROM task WHERE id='new-task' AND (${scopeCondition}) AND (${coreHub})`,
    ),
  ).toBeTruthy()
  f.sqlite.exec(
    "UPDATE organisation SET hubId='private-hub',isHubExclusive=1 WHERE id='org'",
  )
  expect(
    await f.db.get(
      sql`SELECT id FROM task WHERE id='new-task' AND (${scopeCondition}) AND (${coreHub})`,
    ),
  ).toBeFalsy()
  f.sqlite.exec("UPDATE organisation SET hubId=NULL,isHubExclusive=0 WHERE id='org'")
  // A task cannot borrow another proposal's owner or a mismatched parent chain.
  for (const [field, value] of [
    ['contributorId', 'intruder'],
    ['projectId', 'other'],
    ['organisationId', 'other'],
  ]) {
    f.sqlite.prepare(`UPDATE task SET ${field}=? WHERE id='new-task'`).run(value)
    expect(
      await f.db.get(
        sql`SELECT id FROM task WHERE id='new-task' AND (${scopeCondition})`,
      ),
    ).toBeFalsy()
    f.sqlite
      .prepare(`UPDATE task SET ${field}=? WHERE id='new-task'`)
      .run(task[field] as string)
  }
  const accepted = await acceptFeatureCreationProposal(f.db, {
    ...command,
    proposalId: proposal.proposalId,
    expectedVersion: proposal.version,
    validate: () => [],
    completion: featureId =>
      prepareFeatureContributionTaskCompletion(f.db, {
        taskId: 'new-task',
        proposalId: proposal.proposalId,
        expectedModifiedAt: String(task.modifiedAt),
        actorId: 'reviewer',
        guard: sql`1`,
        featureId,
        outcome: 'accepted',
        action: 'added-feature',
        reason: 'Reviewed contribution',
      }),
  })
  expect(accepted).not.toBeNull()
  expect(
    f.sqlite
      .prepare("SELECT featureId,isReviewed,reviewerId FROM task WHERE id='new-task'")
      .get(),
  ).toMatchObject({
    featureId: accepted!.featureId,
    isReviewed: 1,
    reviewerId: 'reviewer',
  })
})

it('keeps migrated task transfer restrictions after removing the transfer table', async () => {
  const f = await fixture()
  expect(await hasFeatureTaskTransfer(f.db, 'moved-task')).toBe(false)
  f.sqlite
    .prepare(`INSERT INTO revisionChangeSet(id,actorId,origin,createdAt,legacyEvidence)
    VALUES ('transfer-proof','editor','user','2026-11-07',?)`)
    .run(
      JSON.stringify({
        taskTransfers: [{ taskId: 'moved-task', sourceFeatureId: 'old' }],
      }),
    )
  expect(await hasFeatureTaskTransfer(f.db, 'moved-task')).toBe(true)
  expect(await hasFeatureTaskTransfer(f.db, 'unrelated-task')).toBe(false)
})

import { retargetFeatureContribution } from '#lib/db/services/featureLifecycleRetarget.js'
it('retargets pending changes explicitly without applying them or moving historical records', async () => {
  const f = await fixture(),
    proposed = structuredClone(f.initial.content)
  proposed.translations.en.description.value = 'Contributed observation'
  const original = (await createPartialFeatureProposal(f.db, {
    ...command,
    baseRevisionId: f.initial.revisionId,
    changes: buildFeatureChanges(f.initial.content, proposed),
    submit: true,
  }))!
  const split = (await splitLifecycleFeature(f.db, {
    ...command,
    expectedRevisionId: f.initial.revisionId,
    expectedVersion: 0,
    titles: ['Left', 'Right'],
    locale: 'en',
    redirectIndex: null,
  }))!
  const child = (await readCurrentFeatureRevision(f.db, {
    featureId: split.featureIds[0],
    guard: sql`1`,
  }))!
  const result = await retargetFeatureContribution(f.db, {
    ...command,
    featureId: child.featureId,
    expectedRevisionId: child.revisionId,
    expectedVersion: 0,
    proposalId: original.proposalId,
    expectedProposalVersion: original.version,
    sourceGuard: sql`1`,
  })
  expect(result.status).toBe('retargeted')
  expect(
    f.sqlite
      .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
      .get(original.proposalId)?.status,
  ).toBe('withdrawn')
  expect(
    await readCurrentFeatureRevision(f.db, { ...command, featureId: child.featureId }),
  ).toMatchObject({ revisionId: child.revisionId, version: 0 })
  if (result.status === 'retargeted') {
    expect(
      await acceptPartialFeatureProposal(f.db, {
        ...command,
        featureId: child.featureId,
        proposalId: result.proposalId,
        expectedProposalVersion: result.version,
        expectedRevisionId: child.revisionId,
        expectedVersion: 0,
      }),
    ).toMatchObject({ status: 'accepted' })
    expect(
      await readCurrentFeatureRevision(f.db, {
        ...command,
        featureId: child.featureId,
      }),
    ).toMatchObject({
      content: {
        translations: {
          en: {
            title: { value: 'Left' },
            description: { value: 'Contributed observation' },
          },
        },
      },
    })
  }
})

import { readFeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'
it('reads ordinary editor history and partial proposals after the old publication tables are gone', async () => {
  const f = await fixture(false),
    proposed = structuredClone(f.initial.content)
  proposed.translations.en.title.value = 'Proposed name'
  const proposal = (await createPartialFeatureProposal(f.db, {
    ...command,
    baseRevisionId: f.initial.revisionId,
    changes: buildFeatureChanges(f.initial.content, proposed),
    submit: true,
  }))!
  const workspace = await readFeatureRevisionWorkspace(f.db, {
    ...command,
    canPublish: true,
  })
  expect(workspace).toMatchObject({
    enabled: true,
    publishedRevisionId: null,
    comparisonRevisionId: f.initial.revisionId,
    generation: 0,
    translations: { en: { title: f.initial.content.translations.en.title.value } },
    privateHistory: [],
    proposals: [
      {
        id: proposal.proposalId,
        candidateRevisionId: proposal.version,
        after: { en: { title: 'Proposed name' } },
      },
    ],
  })
  expect(workspace.history).toHaveLength(1)
})

import {
  createFeatureRevisionProposal,
  saveFeatureRevisionProposal,
  submitFeatureRevisionProposal,
  withdrawFeatureRevisionProposal,
} from '#lib/db/services/featureRevision.js'
it('routes existing contribution save and submit APIs to partial proposals without candidate snapshots', async () => {
  const f = await fixture(),
    content = structuredClone(f.initial.content)
  content.translations.en.title.value = 'Proposed'
  const created = (await createFeatureRevisionProposal(f.db, {
    ...command,
    baseRevisionId: f.initial.revisionId,
    content,
  }))!
  content.translations.en.description.value = 'Another change'
  const version = await saveFeatureRevisionProposal(f.db, {
    ...command,
    proposalId: created.proposalId,
    expectedCandidateRevisionId: created.candidateRevisionId,
    content,
  })
  expect(version).toBeTruthy()
  expect(
    await submitFeatureRevisionProposal(f.db, {
      ...command,
      proposalId: created.proposalId,
      expectedCandidateRevisionId: version!,
    }),
  ).toBe(true)
  expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(1)
  expect(
    f.sqlite.prepare('SELECT status,version FROM featureRevisionProposal').get(),
  ).toMatchObject({ status: 'submitted', version })
  expect(
    await withdrawFeatureRevisionProposal(f.db, {
      ...command,
      proposalId: created.proposalId,
      expectedCandidateRevisionId: version!,
    }),
  ).toBe(true)
  expect(
    f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get()?.status,
  ).toBe('withdrawn')
})

import { saveFeatureImageMetadataDraft } from '#lib/db/services/featureImageMetadataRevision.js'
it('saves staff metadata through the existing image editor without making a proposal', async () => {
  const f = await fixture(false)
  const result = await saveFeatureImageMetadataDraft(f.db, {
    ...command,
    imageId: 'photo',
    expectedImageRevisionId: 'image-r1',
    derive: m => ({ ...m, credit: 'Updated credit' }),
  })
  expect(result.status).toBe('accepted')
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
  ).toBe(0)
  expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
    version: 1,
    state: { isPublished: false },
  })
})

import { saveFeatureImageUploadDraft } from '#lib/db/services/featureImageUploadRevision.js'
import { prepareFeatureUploadSubmission } from '#lib/db/services/featureUploadTasks.js'
import { acceptFeatureEditorialRevision } from '#lib/db/services/featureEditorialRevision.js'
import { readFeaturePublicationChanges } from '#lib/db/services/featureRevisionHistory.js'
it('carries contributed upload evidence through task review without candidate Feature snapshots', async () => {
  const f = await fixture(false)
  f.sqlite
    .prepare(
      "INSERT INTO task(id,featureId,organisationId,projectId,contributorId,isDraft,isReviewed,type,modifiedAt) VALUES ('photo-task','f','org','project','editor',1,0,'newPhoto','2026-01-01')",
    )
    .run()
  const uploaded = await saveFeatureImageUploadDraft(f.db, {
    ...command,
    storageNamespace: 'local',
    storageKey: 'new-upload-test',
    mediaType: 'image/jpeg',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    taskIds: ['photo-task'],
    draftContributor: true,
    intent: 'general',
    deriveMetadata: () => ({ version: 1, presentationMode: 'cover' as const }),
  })
  expect(uploaded.status).toBe('saved')
  if (uploaded.status !== 'saved') throw new Error('Upload was not retained')
  expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(1)
  const submit = await prepareFeatureUploadSubmission(f.db, {
    ...command,
    taskId: 'photo-task',
  })
  expect(await executeRevisionBatch(f.db, sql`1`, submit)).toBeTruthy()
  f.sqlite.prepare("UPDATE task SET isDraft=0 WHERE id='photo-task'").run()
  const result = await acceptFeatureEditorialRevision(f.db, {
    ...command,
    proposalId: uploaded.proposalId,
    expectedCandidateRevisionId: uploaded.candidateRevisionId,
    expectedPublishedRevisionId: f.initial.revisionId,
    expectedGeneration: 0,
    expectedScope: {
      organisationId: 'org',
      projectId: 'project',
      layerId: 'layer',
      resourceHubId: null,
    },
    validateResult: () => [],
    canReviewPath: path => path[0] === 'gallery',
    galleryAttachmentGuard: sql`1`,
  })
  expect(result.status).toBe('accepted')
  expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
    version: 1,
    state: { isPublished: false },
  })
  expect(
    f.sqlite
      .prepare("SELECT isReviewed,reviewOutcome FROM task WHERE id='photo-task'")
      .get(),
  ).toMatchObject({ isReviewed: 1, reviewOutcome: 'accepted' })
  expect(
    f.sqlite.prepare('SELECT proposalVersion FROM featureUploadEvidence').get()
      ?.proposalVersion,
  ).toBe(uploaded.candidateRevisionId)
})
it('includes visibility and archive changes in the ordinary revision history', async () => {
  const f = await fixture()
  await saveFeatureEdit(f.db, {
    ...command,
    expectedRevisionId: f.initial.revisionId,
    expectedVersion: 0,
    state: { isPublished: false, isArchived: true },
    derive: c => c,
  })
  const review = await readFeaturePublicationChanges(f.db, {
    ...command,
    generation: 1,
    internalIds: new Set(),
    allowedInternalIds: new Set(),
  })
  expect(review).toMatchObject({ unpublished: true, baseline: false })
  expect(review?.changes.map(change => change.path)).toContainEqual([
    'recordState',
    'isPublished',
  ])
  expect(review?.changes.map(change => change.path)).toContainEqual([
    'recordState',
    'isArchived',
  ])
})

import { readImageRevisionDelivery } from '#lib/db/services/imageRevisionDelivery.js'
it('serves only current published image pins while retaining authorized historical delivery', async () => {
  const f = await fixture(false)
  expect(await readImageRevisionDelivery(f.db, 'image-r1')).toBeNull()
  expect(await routeFeatureRevisionPublication(f.db, { ...command, state: true })).toBe(
    'updated',
  )
  expect(await readImageRevisionDelivery(f.db, 'image-r1')).toMatchObject({
    storageKey: 'immutable-photo',
  })
  const changed = await saveFeatureImageMetadataDraft(f.db, {
    ...command,
    imageId: 'photo',
    expectedImageRevisionId: 'image-r1',
    derive: m => ({ ...m, credit: 'New metadata' }),
  })
  if (changed.status !== 'accepted') throw new Error('Metadata was not accepted')
  expect(await readImageRevisionDelivery(f.db, changed.imageRevisionId)).toMatchObject({
    storageKey: 'immutable-photo',
  })
  expect(await readImageRevisionDelivery(f.db, 'image-r1')).toBeNull()
  expect(await readImageRevisionDelivery(f.db, 'image-r1', sql`1`)).toMatchObject({
    storageKey: 'immutable-photo',
  })
})

it('accepts staff uploads directly and replays the same acceptance without making a draft or duplicate file version', async () => {
  const f = await fixture(false)
  const input = {
    ...command,
    storageNamespace: 'local' as const,
    storageKey: 'staff-upload-test',
    mediaType: 'image/jpeg',
    bytes: new Uint8Array([4, 5, 6]).buffer,
    taskIds: [],
    draftContributor: false,
    intent: 'general' as const,
    deriveMetadata: () => ({ version: 1, presentationMode: 'cover' as const }),
  }
  const first = await saveFeatureImageUploadDraft(f.db, input)
  expect(first.status).toBe('accepted')
  if (first.status !== 'accepted') throw new Error('Staff upload was not accepted')
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
  ).toBe(0)
  expect(await readCurrentFeatureRevision(f.db, command)).toMatchObject({
    version: 1,
    state: { isPublished: false },
  })
  const replay = await saveFeatureImageUploadDraft(f.db, input)
  expect(replay).toMatchObject({ ...first, replayed: true })
  expect(f.sqlite.prepare('SELECT count(*) n FROM imageAssetVersion').get()?.n).toBe(3)
  expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(2)
  const replacement = await saveFeatureImageUploadDraft(f.db, {
    ...input,
    storageKey: 'staff-replacement-test',
    bytes: new Uint8Array([7, 8, 9]).buffer,
    replacement: { imageId: first.imageId, imageRevisionId: first.imageRevisionId },
  })
  expect(replacement.status).toBe('accepted')
  expect(
    f.sqlite
      .prepare('SELECT storageKey FROM imageAssetVersion WHERE id=?')
      .get(first.assetVersionId)?.storageKey,
  ).toBe('staff-upload-test')
  expect(
    await saveFeatureImageUploadDraft(f.db, {
      ...input,
      storageKey: 'staff-replacement-test',
      bytes: new Uint8Array([7, 8, 9]).buffer,
      replacement: { imageId: first.imageId, imageRevisionId: first.imageRevisionId },
    }),
  ).toMatchObject({ ...replacement, replayed: true })
})

import { applyCurrentFeatureIdentitySelection } from '#lib/db/services/featureLifecycleIdentityAdapter.js'
it('applies the existing dialog selectors without persisted preparation or reserved child records', async () => {
  const f = await fixture(),
    allowedInternalIds = new Set(Object.keys(f.initial.content.properties))
  const split = await applyCurrentFeatureIdentitySelection(f.db, {
    ...command,
    allowedInternalIds,
    selection: {
      kind: 'split',
      inputs: [{ featureId: 'f', revisionId: f.initial.revisionId, generation: 0 }],
      outputs: [
        { featureId: null, sourceFeatureId: 'f', titles: { en: 'First' } },
        { featureId: null, sourceFeatureId: 'f', titles: { en: 'Second' } },
      ],
      redirectOutputIndex: null,
      reason: 'Split in the ordinary editor',
    },
  })
  expect(split).not.toBeNull()
  const sources = await Promise.all(
    split!.outputs.map(featureId =>
      readCurrentFeatureRevision(f.db, { featureId, guard: sql`1` }),
    ),
  )
  const merge = await applyCurrentFeatureIdentitySelection(f.db, {
    ...command,
    allowedInternalIds,
    selection: {
      kind: 'merge',
      inputs: sources.map(source => ({
        featureId: source!.featureId,
        revisionId: source!.revisionId,
        generation: source!.version,
      })),
      outputs: [
        {
          featureId: sources[0]!.featureId,
          sourceFeatureId: sources[0]!.featureId,
          titles: { en: 'Combined' },
        },
      ],
      reason: 'Merged in the ordinary editor',
    },
  })
  expect(merge?.outputs).toEqual([sources[0]!.featureId])
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
  ).toBe(0)
  expect(
    f.sqlite
      .prepare(
        "SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('featureIdentityProposal','featureIdentityReservation')",
      )
      .get()?.n,
  ).toBe(0)
  expect(
    await readCurrentFeatureRevision(f.db, {
      featureId: sources[0]!.featureId,
      guard: sql`1`,
    }),
  ).toMatchObject({
    state: { isPublished: false },
    content: { translations: { en: { title: { value: 'Combined' } } } },
  })
})

it('pins current galleries and records gallery removal after legacy storage is removed', async () => {
  const f = await fixture(true)
  const { applyFeatureGalleryPins } = await import(
    '#lib/db/services/featureGalleryRead.js'
  )
  const { removeAcceptedFeatureImage } = await import(
    '#lib/db/services/featureGalleryCommands.js'
  )
  const rows = [
    {
      id: 'f',
      images: f.initial.content.gallery.order.map(imageId => ({
        imageId,
        isPublished: true,
        image: { id: imageId },
      })),
    },
  ]
  const pinned = await applyFeatureGalleryPins(f.db, rows)
  expect(pinned[0].images[0].image).toHaveProperty(
    'imageRevisionId',
    f.initial.content.gallery.entries[pinned[0].images[0].imageId].imageRevisionId,
  )
  expect(await removeAcceptedFeatureImage(f.db, { ...command, imageId: 'photo' })).toBe(
    'removed',
  )
  const current = await readCurrentFeatureRevision(f.db, command)
  expect(current?.content.gallery.order).not.toContain('photo')
  expect(
    f.sqlite.prepare("SELECT count(*) n FROM imageRevision WHERE imageId='photo'").get()
      ?.n,
  ).toBeGreaterThan(0)
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('keeps unpublished accepted Features out of ancestor publication', async () => {
  const f = await fixture(false)
  const { featurePublicationEligibility } = await import(
    '#lib/db/services/publication.js'
  )
  const eligible = await featurePublicationEligibility(f.db)
  expect(await f.db.get(sql`SELECT id FROM feature WHERE ${eligible}`)).toBeUndefined()
  await saveFeatureEdit(f.db, {
    ...command,
    expectedRevisionId: f.initial.revisionId,
    expectedVersion: 0,
    state: { isPublished: true },
    derive: content => content,
  })
  expect(await f.db.get(sql`SELECT id FROM feature WHERE ${eligible}`)).toMatchObject({
    id: 'f',
  })
})

it('resolves accepted history actors from current profiles and retains missing-user evidence', async () => {
  const f = await fixture()
  f.sqlite.exec(
    "INSERT INTO user(id,name,username,displayUsername) VALUES ('author','History Author','history.author','History.Author')",
  )
  const request = { ...command, canPublish: true }
  const workspace = await readFeatureRevisionWorkspace(f.db, request)
  expect(workspace.history[0]).toMatchObject({
    actorId: 'author',
    actorName: 'History Author',
    actorUsername: 'history.author',
    actorDisplayUsername: 'History.Author',
  })
  f.sqlite.exec("DELETE FROM user WHERE id='author'")
  expect((await readFeatureRevisionWorkspace(f.db, request)).history[0]).toMatchObject({
    actorId: 'author',
    actorName: null,
    actorUsername: null,
    actorDisplayUsername: null,
  })
  expect(
    (await readFeatureRevisionWorkspace(f.db, { ...request, guard: sql`0` })).history,
  ).toEqual([])
})

describe('accepted editing windows', () => {
  it('keeps one snapshot through successive edits while advancing the concurrency version', async () => {
    const f = await fixture()
    const save = async (title: string) => {
      const current = (await readCurrentFeatureRevision(f.db, command))!
      return saveFeatureEdit(f.db, {
        ...command,
        expectedRevisionId: current.revisionId,
        expectedVersion: current.version,
        derive: content => {
          content.translations.en.title.value = title
          return content
        },
      })
    }
    const first = await save('first'),
      second = await save('second')
    expect(second).toBe(first)
    expect((await readCurrentFeatureRevision(f.db, command))?.version).toBe(2)
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(2)
    expect(await save('second')).toBe(first)
    expect((await readCurrentFeatureRevision(f.db, command))?.version).toBe(2)
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})

it('rolls back snapshot, projection, version and timer when a coalesced batch fails late', async () => {
  const f = await fixture()
  const id = await saveFeatureEdit(f.db, {
    ...command,
    expectedRevisionId: f.initial.revisionId,
    expectedVersion: 0,
    derive: c => {
      c.translations.en.title.value = 'Before failure'
      return c
    },
  })
  const snapshot = () =>
    ['featureRevision', 'feature', 'featureI18n', 'revisionEditWindow'].map(table =>
      f.sqlite.prepare(`SELECT * FROM ${table}`).all(),
    )
  const before = snapshot()
  f.sqlite.exec(
    "CREATE TRIGGER fail_window_close BEFORE DELETE ON featureRevisionWriteScope BEGIN SELECT RAISE(ABORT,'late failure'); END",
  )
  await expect(
    saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: id!,
      expectedVersion: 1,
      derive: c => {
        c.translations.en.title.value = 'Must roll back'
        return c
      },
    }),
  ).rejects.toThrow(/late failure/)
  expect(snapshot()).toEqual(before)
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
  ).toBe(0)
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM revisionEditSelection').get()?.n,
  ).toBe(0)
})
