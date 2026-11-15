// NODE
import { createHash } from 'node:crypto'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// DOMAIN
import { projectSaanSeoiPlace } from '../../src/lib/locations/saanseoi'
import { persistSaanSeoiPlace } from '../../src/lib/db/services/locationSource'
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from '../../src/lib/db/services/locationShared'
import {
  readIdentityCatalogueByCode,
  saveIdentityCatalogue,
} from '../../src/lib/db/services/identityCatalogue'
import {
  seedIdentityCatalogue,
  IdentityCatalogueContentSchema,
} from '../../src/lib/locations/identityCatalogue'
import { DEV_PERSONAS } from '../../src/lib/auth/dev-personas'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

const apply = process.argv.includes('--apply')
if (process.argv.slice(2).some(arg => arg !== '--apply'))
  throw new Error('Local-only importer: only --apply supported')
const root = '.research/catalogue/tko'
const assets = await Bun.file(`${root}/artwork.json`).json()
const proxy = await getPlatformProxy<{ DB: D1Database; ASSET_PUBLIC_DEV: R2Bucket }>({
  configPath: './wrangler.local.toml',
  remoteBindings: false,
})
const receipts = []
try {
  const db = drizzle(proxy.env.DB) as Database
  const organisation = await db.get<{ id: string }>(
    sql`SELECT id FROM organisation WHERE code='saanseoi' AND isArchived=0`,
  )
  if (!organisation) throw new Error('SaanSeoi Organisation unavailable')
  for (const asset of assets) {
    const document = await Bun.file(`${root}/${asset.code}.json`).json()
    if (document.data.length !== 1 || document.data[0].id !== asset.ssId)
      throw new Error('Unexpected source cohort')
    const projection = projectSaanSeoiPlace(document.data[0], document.meta, {
      apiReleaseSet: document.meta.apiReleaseSet,
      snapshotId: document.data[0].attributes.snapshotId,
    })
    const existing = await readIdentityCatalogueByCode(db, 'brand', asset.code)
    const id = existing?.id ?? `tko-brand-${asset.code}`
    const {
      id: _id,
      kind: _kind,
      version: _version,
      wikidataId: _wiki,
      ...content
    } = existing ?? {
      ...seedIdentityCatalogue(projection.facts.names),
      id,
      kind: 'brand',
      version: 0,
    }
    content.code ??= asset.code
    const src = `/api/identity-catalogue/logos/${asset.assetId}`
    // Preserve existing approved artwork; the local experiment adds an authentic solid-background mark.
    if (asset.verifiedMark)
      content.artwork = {
        ...content.artwork,
        logo:
          content.artwork?.logo?.status === 'approved' &&
          !(
            id.startsWith('tko-brand-') &&
            content.artwork.logo.notes?.includes('local indoor-map experiment')
          )
            ? content.artwork.logo
            : {
                src,
                background: '#ffffff',
                status: 'approved',
                format: 'png',
                sourceWidth: asset.sourceWidth,
                sourceHeight: asset.sourceHeight,
                sourceUrl: asset.sourceUrl,
                notes:
                  'Verified brand mark from the retained source URL, composited on opaque white for the local indoor-map experiment.',
              },
      }
    content.evidence = [
      ...(content.evidence ?? []).filter(
        e => e.url !== `https://www.tkoplaza.com.hk/en/shops_list/shop/${asset.shopId}`,
      ),
      {
        kind: 'directory',
        url: `https://www.tkoplaza.com.hk/en/shops_list/shop/${asset.shopId}`,
        note: `TKO Plaza unit ${asset.unit}; source identity ${asset.ssId}.`,
      },
    ]
    const parsed = IdentityCatalogueContentSchema.parse(content)
    const bytes = new Uint8Array(await Bun.file(asset.file).arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
      throw new Error('Artwork changed')
    const level = asset.unit.startsWith('L2') ? 2 : 1
    const unit = asset.unit.replace(/L[12]-/g, '').replace(/ - /g, '–')
    const addresses = {
      en: `Shop ${asset.unit}, ${level}/F, TKO Plaza, 1 Tong Tak Street, Tseung Kwan O`,
      'zh-Hant': `將軍澳唐德街1號將軍澳廣場${level}樓L${level}-${unit}號舖`,
    }
    if (!apply) {
      receipts.push({ code: asset.code, id, addresses })
      continue
    }
    const key = `identity-catalogue/${asset.assetId}.png`
    const retained = await proxy.env.ASSET_PUBLIC_DEV.get(key)
    if (
      retained &&
      createHash('sha256')
        .update(new Uint8Array(await retained.arrayBuffer()))
        .digest('hex') !== asset.sha256
    )
      throw new Error('Immutable asset conflict')
    if (asset.verifiedMark && !retained)
      await proxy.env.ASSET_PUBLIC_DEV.put(key, bytes, {
        httpMetadata: { contentType: 'image/png' },
      })
    if (
      !existing ||
      JSON.stringify(content) !== JSON.stringify(parsed) ||
      JSON.stringify(existing.artwork) !== JSON.stringify(parsed.artwork) ||
      JSON.stringify(existing.evidence) !== JSON.stringify(parsed.evidence)
    ) {
      const saved = await saveIdentityCatalogue(db, {
        id,
        kind: 'brand',
        expectedVersion: existing?.version ?? 0,
        content: parsed,
        actorId: DEV_PERSONAS.admin.id,
        guard: sql`1`,
      })
      if (!saved) throw new Error('Catalogue concurrently changed')
    }
    const source = await persistSaanSeoiPlace(db, projection)
    const head = await readSharedLocationCorrection(db, source.locationId)
    const location = {
      ...projection.facts.location,
      address: { ...projection.facts.location.address, displayOverrides: addresses },
    }
    const previous = head ? JSON.parse(head.corrections) : {}
    let revision = head?.id
    if (
      JSON.stringify(previous.location?.choice.value) !== JSON.stringify(location) ||
      previous.brandId?.choice.value !== id
    ) {
      const correction = await prepareSharedLocationCorrection(db, {
        locationId: source.locationId,
        sourceRevisionId: source.revisionId,
        expectedRevision: head?.id ?? null,
        actorId: DEV_PERSONAS.admin.id,
        rights: { canEdit: true, superAdmin: true },
        guard: sql`1`,
        patch: {
          location: { mode: 'override', value: location },
          brandId: { mode: 'override', value: id },
        },
        provenance: {
          kind: 'staff-correction',
          authorOrganisationId: organisation.id,
          source: 'TKO Plaza official tenant directory',
          sourceUrl: `https://www.tkoplaza.com.hk/en/shops_list/shop/${asset.shopId}`,
          unitCode: asset.unit,
          ...(asset.code === 'chicken-factory'
            ? {
                userSuppliedAddress: addresses,
                note: 'User correction corroborated by the official mall directory: L2-072, not L2-070–072.',
              }
            : {}),
        },
      })
      await db.batch(correction.queries)
      revision = correction.id
    }
    receipts.push({
      code: asset.code,
      id,
      ...source,
      sharedRevisionId: revision,
      authorOrganisationId: organisation.id,
      addresses,
      artwork: parsed.artwork?.logo,
    })
  }
  await Bun.write(
    `${root}/import-${apply ? 'receipt' : 'preview'}.json`,
    JSON.stringify(receipts, null, 2),
  )
  console.log(JSON.stringify({ apply, count: receipts.length, receipts }))
} finally {
  await proxy.dispose()
}
