// PLAYWRIGHT
import { chromium } from 'playwright'
// STORAGE
import { AwsClient } from 'aws4fetch'
// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// IMAGES
import sharp from 'sharp'

// Run through dev-check with --env-file=.dev.vars after authorizing development R2 writes.
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost'
if (new URL(origin).hostname !== 'hype.localhost')
  throw new Error('This preparation script targets hype.localhost only')
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY
if (!accountId || !accessKeyId || !secretAccessKey)
  throw new Error('Development R2 credentials missing')
const aws = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: 'auto',
})
const response = await fetch(
  `${origin}/api/mapRenders/refresh?mode=plan&kinds=projects,layers&force=true`,
  { method: 'POST' },
)
if (!response.ok) throw new Error(`Render plan HTTP ${response.status}`)
const { jobs } = (await response.json()) as {
  jobs: Array<{
    kind: string
    identifier: string
    targetObjectKey: string
    sourceUrl: string
  }>
}
const results: Array<{ kind: string; id: string; status: string; error?: string }> = []
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-web-security'],
})
await mkdir('output/playwright/sharing-previews', { recursive: true })
try {
  for (const job of jobs) {
    const asset = `${origin}/api/mapRenders/${job.kind}/${encodeURIComponent(job.identifier)}/asset`
    const existing = await fetch(asset)
    if (existing.ok) {
      await existing.arrayBuffer()
      results.push({ kind: job.kind, id: job.identifier, status: 'available' })
      console.log('AVAILABLE', job.kind, job.identifier)
      continue
    }
    if (existing.status !== 404) throw new Error(`Asset lookup HTTP ${existing.status}`)
    let failure = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      // Disabled web security omits Origin; preserve the real origin for first-party tile access.
      const page = await browser.newPage({
        viewport: { width: 512, height: 512 },
        deviceScaleFactor: 1,
        extraHTTPHeaders: { Origin: origin },
      })
      try {
        await page.goto(job.sourceUrl, { waitUntil: 'load' })
        await page.waitForSelector('#map-style-render-ready[data-ready="true"]', {
          timeout: 60_000,
        })
        const bytes = await page.screenshot()
        await sharp(bytes).raw().toBuffer()
        await writeFile(
          `output/playwright/sharing-previews/${job.kind}-${encodeURIComponent(job.identifier)}.png`,
          bytes,
        )
        const key = job.targetObjectKey.split('/').map(encodeURIComponent).join('/')
        const uploaded = await aws.fetch(
          `https://${accountId}.r2.cloudflarestorage.com/hype-assets-dev/${key}`,
          {
            method: 'PUT',
            headers: {
              'content-type': 'image/png',
              'cache-control': 'public, max-age=31536000, immutable',
            },
            body: bytes,
          },
        )
        if (!uploaded.ok) throw new Error(`Development upload HTTP ${uploaded.status}`)
        const readback = await fetch(asset)
        if (!readback.ok) throw new Error(`Asset readback HTTP ${readback.status}`)
        const served = Buffer.from(await readback.arrayBuffer())
        if (!served.equals(bytes))
          throw new Error('Asset readback differs from rendered bytes')
        failure = ''
        console.log('PREPARED', job.kind, job.identifier)
        break
      } catch (error) {
        failure = String(error).split('Call log:')[0].trim()
        const renderError = await page
          .locator('#map-style-render-ready')
          .getAttribute('data-error')
          .catch(() => null)
        if (renderError) failure = renderError
        console.log('RETRY', job.kind, job.identifier, attempt, failure)
      } finally {
        await page.close()
      }
    }
    results.push({
      kind: job.kind,
      id: job.identifier,
      status: failure ? 'failed' : 'prepared',
      ...(failure ? { error: failure } : {}),
    })
  }
} finally {
  await browser.close()
  await writeFile(
    'output/playwright/sharing-preview-preparation.json',
    JSON.stringify(results, null, 2),
  )
}
console.log(JSON.stringify(results))
if (results.some(result => result.status === 'failed')) process.exitCode = 1
