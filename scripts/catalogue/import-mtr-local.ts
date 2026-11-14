// NODE
import { createHash } from 'node:crypto'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  IdentityCatalogueContentSchema,
  seedIdentityCatalogue,
} from '../../src/lib/locations/identityCatalogue'
import {
  readIdentityCatalogueByCode,
  saveIdentityCatalogue,
} from '../../src/lib/db/services/identityCatalogue'
import { DEV_PERSONAS } from '../../src/lib/auth/dev-personas'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

type Evidence = {
  kind: 'directory' | 'ownership' | 'website' | 'operator'
  url: string
  note: string
}
type Entity = {
  code: string
  name: string
  website: string
  category?: string
  parent?: string
  brands?: string[]
  evidence?: Evidence[]
  occurrences?: { station: string; nameZh: string }[]
}
type Artwork = {
  code: string
  file: string
  sha256: string
  assetId: string
  sourceUrl: string
  background: string
  notes: string
}
const apply = process.argv.includes('--apply')
if (process.argv.slice(2).some(arg => arg !== '--apply'))
  throw new Error('Only --apply is supported; this importer is local-only')
const root = '.research/catalogue/mtr'
const brands: Entity[] = await Bun.file('scripts/catalogue/mtr-brands.json').json()
const groups: Entity[] = await Bun.file('scripts/catalogue/mtr-groups.json').json()
const assets: Artwork[] = await Bun.file(`${root}/prepared-artwork.json`).json()
const proxy = await getPlatformProxy<{ DB: D1Database; ASSET_PUBLIC_DEV: R2Bucket }>({
  configPath: './wrangler.local.toml',
  remoteBindings: false,
})
const receipts: unknown[] = []
try {
  const db = drizzle(proxy.env.DB) as Database
  const ids = new Map<string, string>()
  for (const group of groups) {
    const existing = await readIdentityCatalogueByCode(db, 'group', group.code)
    ids.set(group.code, existing?.id ?? `mtr-group-${group.code}`)
  }
  // Parents precede children in the reviewed manifest; reject a misordered import.
  const complete = new Set<string>()
  for (const entity of [...groups, ...brands]) {
    const kind = groups.includes(entity) ? 'group' : 'brand'
    if (entity.parent && !complete.has(entity.parent))
      throw new Error(`Parent must precede child: ${entity.code}`)
    const existing = await readIdentityCatalogueByCode(db, kind, entity.code)
    const id = existing?.id ?? `mtr-${kind}-${entity.code}`
    const {
      id: _id,
      kind: _kind,
      version: _version,
      wikidataId: _wiki,
      ...content
    } = existing ?? {
      ...seedIdentityCatalogue({
        en: entity.name,
        'zh-Hant': entity.occurrences?.find(x => x.nameZh)?.nameZh ?? '',
      }),
      id,
      kind,
      version: 0,
    }
    const before = JSON.stringify(content)
    content.code ??= entity.code
    if (
      entity.code === 'shiu-heung-yuen-bakery' &&
      existing?.version === 1 &&
      id === 'mtr-brand-shiu-heung-yuen-bakery' &&
      entity.category
    )
      content.categories = [entity.category]
    if (!content.categories?.length && entity.category)
      content.categories = [entity.category]
    const parent =
      kind === 'group'
        ? entity.parent
        : groups.find(g => g.brands?.includes(entity.code))?.code
    if (parent && !content.groupId) content.groupId = ids.get(parent)
    const evidence: Evidence[] = [...(entity.evidence ?? [])]
    if (kind === 'brand') {
      for (const station of new Set(entity.occurrences?.map(x => x.station) ?? []))
        evidence.push({
          kind: 'directory',
          url: `https://www.mtr.com.hk/en/customer/shops/shop_search.php?query_type=search&start=${station === 'kennedy-town' ? 83 : 39}`,
          note: `MTR shop directory for ${station}; categories mapped to the existing place taxonomy.`,
        })
      const owner = groups.find(g => g.brands?.includes(entity.code))
      if (owner) evidence.push(...(owner.evidence ?? []))
    }
    if (entity.website)
      evidence.push({
        kind: 'website',
        url: entity.website,
        note: 'Research source; not proof of parent ownership.',
      })
    content.evidence = [
      ...new Map(
        [
          ...(content.evidence ?? []).filter(
            e => e.note !== 'Research source; not proof of parent ownership.',
          ),
          ...evidence,
        ].map(e => [`${e.kind}:${e.url}`, e]),
      ).values(),
    ]
    const asset = assets.find(a => a.code === entity.code)
    if (asset && !content.artwork?.logo) {
      const bytes = new Uint8Array(await Bun.file(asset.file).arrayBuffer())
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
        throw new Error(`Asset changed: ${asset.code}`)
      const key = `identity-catalogue/${asset.assetId}.png`
      if (apply) {
        const old = await proxy.env.ASSET_PUBLIC_DEV.get(key)
        if (
          old &&
          createHash('sha256')
            .update(new Uint8Array(await old.arrayBuffer()))
            .digest('hex') !== asset.sha256
        )
          throw new Error(`Immutable asset conflict: ${key}`)
        if (!old)
          await proxy.env.ASSET_PUBLIC_DEV.put(key, bytes, {
            httpMetadata: { contentType: 'image/png' },
          })
      }
      content.artwork = {
        ...content.artwork,
        logo: {
          src: `/api/identity-catalogue/logos/${asset.assetId}`,
          background: asset.background,
          status: 'candidate',
          sourceUrl: asset.sourceUrl,
          notes: asset.notes,
        },
      }
    }
    const parsed = IdentityCatalogueContentSchema.parse(content)
    const changed = before !== JSON.stringify(parsed)
    let version = existing?.version ?? 0
    if (apply && changed) {
      const saved = await saveIdentityCatalogue(db, {
        id,
        kind,
        expectedVersion: version,
        content: parsed,
        actorId: DEV_PERSONAS.admin.id,
        guard: sql`1`,
      })
      if (!saved) throw new Error(`Concurrent catalogue edit: ${id}`)
      version = saved.version
    }
    receipts.push({
      code: entity.code,
      id,
      kind,
      version,
      changed,
      artwork: Boolean(content.artwork?.logo),
      parent: content.groupId ?? null,
    })
    if (kind === 'group') complete.add(entity.code)
  }
  await Bun.write(
    `${root}/import-${apply ? 'receipt' : 'preview'}.json`,
    `${JSON.stringify(receipts, null, 2)}\n`,
  )
  console.log(
    JSON.stringify({ apply, total: receipts.length, reviewAssets: assets.length }),
  )
} finally {
  await proxy.dispose()
}
