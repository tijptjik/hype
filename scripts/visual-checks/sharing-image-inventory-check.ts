// RUNTIME
import { Database } from 'bun:sqlite'
// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// IMAGES
import sharp from 'sharp'

// Read the local inventory, then test anonymous metadata and actual downloadable bytes.
const databasePath = process.env.HYPE_CHECK_DB
if (!databasePath)
  throw new Error('Set HYPE_CHECK_DB to the running local D1 SQLite file')
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost'
const db = new Database(databasePath, { readonly: true })
const results: Array<Record<string, unknown>> = []
/** Downloads and fully decodes an image instead of trusting its response headers.
 * @param url Local image or sharing endpoint.
 * @returns Verified response and decoded image dimensions.
 */
async function inspectImage(url: string): Promise<Record<string, unknown>> {
  const image = await fetch(url)
  if (!image.ok) throw new Error(`Download HTTP ${image.status}`)
  const contentType = image.headers.get('content-type')
  if (!contentType?.startsWith('image/')) throw new Error('Download is not an image')
  const bytes = Buffer.from(await image.arrayBuffer())
  const decoded = await sharp(bytes).metadata()
  await sharp(bytes).raw().toBuffer()
  if (!decoded.width || !decoded.height) throw new Error('Image dimensions missing')
  return {
    status: 'passed',
    imageStatus: image.status,
    contentType,
    bytes: bytes.length,
    width: decoded.width,
    height: decoded.height,
  }
}
try {
  for (const kind of ['organisation', 'project', 'layer'] as const) {
    const rows = db
      .query(
        `SELECT id, ${kind === 'layer' ? 'id' : 'code'} AS ref FROM ${kind} ORDER BY id`,
      )
      .all() as Array<{ id: string; ref: string }>
    for (const row of rows) {
      const endpoint = `${origin}/api/share/${kind}/${encodeURIComponent(row.ref)}`
      const result: Record<string, unknown> = { kind, ...row }
      try {
        const metadata = await fetch(endpoint)
        result.metadataStatus = metadata.status
        if (metadata.status === 404) {
          // Private, archived and other-hub resources must remain unavailable anonymously.
          result.status = 'not-public-in-this-hub'
        } else {
          if (!metadata.ok) throw new Error(`Metadata HTTP ${metadata.status}`)
          const resource = (await metadata.json()) as { title: string; image: string }
          result.title = resource.title
          result.image = resource.image
          Object.assign(result, await inspectImage(`${endpoint}?image=1`))
        }
      } catch (error) {
        Object.assign(result, { status: 'failed', error: String(error) })
      }
      results.push(result)
      console.log(kind, row.ref, result.status, result.error ?? '')
    }
  }
  // Verify previews on unpublished resources too; plan mode does not generate or upload assets.
  const planResponse = await fetch(
    `${origin}/api/mapRenders/refresh?mode=plan&kinds=projects,layers&force=true`,
    { method: 'POST' },
  )
  if (!planResponse.ok) throw new Error(`Render inventory HTTP ${planResponse.status}`)
  const plan = (await planResponse.json()) as {
    jobs: Array<{ kind: string; identifier: string }>
  }
  for (const job of plan.jobs) {
    const result: Record<string, unknown> = {
      kind: `${job.kind}-preview`,
      ref: job.identifier,
    }
    try {
      Object.assign(
        result,
        await inspectImage(
          `${origin}/api/mapRenders/${job.kind}/${encodeURIComponent(job.identifier)}/asset`,
        ),
      )
    } catch (error) {
      Object.assign(result, { status: 'failed', error: String(error) })
    }
    results.push(result)
    console.log(result.kind, result.ref, result.status)
  }
  // Also check assigned logos on unpublished organisations without changing their visibility.
  const logos = db
    .query(
      'SELECT o.code, o.isArchived, i.env, i.cdn, i.publicId, i.version FROM organisation o LEFT JOIN image i ON i.id = o.imageId ORDER BY o.code',
    )
    .all() as Array<{
    code: string
    isArchived: number
    env: string | null
    cdn: string | null
    publicId: string | null
    version: number | null
  }>
  for (const logo of logos) {
    const result: Record<string, unknown> = {
      kind: 'organisation-logo',
      ref: logo.code,
    }
    try {
      if (!logo.publicId) {
        Object.assign(result, {
          status: 'no-logo-assigned',
          archived: Boolean(logo.isArchived),
        })
      } else {
        if (logo.cdn !== 'cloudflareR2')
          throw new Error(`Unsupported logo CDN ${logo.cdn}`)
        const stage =
          logo.env === 'production' || logo.env === 'preview' ? `/${logo.env}` : ''
        const base =
          process.env.HYPE_CHECK_ASSET_ORIGIN ?? 'http://assets.hype.localhost'
        Object.assign(
          result,
          await inspectImage(
            `${base}${stage}/image/upload/c_fit,h_1024,w_1024/g_auto/f_jpeg/q_auto/v${logo.version}/${logo.publicId}`,
          ),
        )
      }
    } catch (error) {
      Object.assign(result, { status: 'failed', error: String(error) })
    }
    results.push(result)
    console.log('organisation-logo', logo.code, result.status)
  }
} finally {
  db.close()
}
await mkdir('output/playwright', { recursive: true })
await writeFile(
  'output/playwright/sharing-image-inventory.json',
  JSON.stringify({ origin, checkedAt: new Date().toISOString(), results }, null, 2),
)
const failed = results.filter(result => result.status === 'failed')
console.log(
  JSON.stringify({
    total: results.length,
    passed: results.filter(result => result.status === 'passed').length,
    unavailable: results.filter(result => result.status === 'not-public-in-this-hub')
      .length,
    failed: failed.length,
  }),
)
if (failed.length) process.exitCode = 1
