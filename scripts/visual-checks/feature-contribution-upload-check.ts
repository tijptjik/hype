/**
 * Exercise real contribution upload and review against disposable local persona servers.
 * Run via dev-check with HYPE_LIFECYCLE_FIXTURE pointing to { state, database }.
 * Start ordinary-user and admin personas against that same state on ports 4184/4183.
 * All original-image PUTs are intercepted into local R2; remote transport is not tested.
 */
import { chromium } from 'playwright'
import { getPlatformProxy } from 'wrangler'
import sharp from 'sharp'
import { Database } from 'bun:sqlite'
const fixturePath = process.env.HYPE_LIFECYCLE_FIXTURE
if (!fixturePath)
  throw Error('Set HYPE_LIFECYCLE_FIXTURE to a disposable fixture receipt')
const fixture = await Bun.file(fixturePath).json()
const { realpathSync } = await import('node:fs')
const state = realpathSync(fixture.state)
if (
  !state.startsWith('/tmp/') ||
  !realpathSync(fixture.database).startsWith(state + '/')
)
  throw Error('Only disposable /tmp state is allowed')
const userOrigin = process.env.HYPE_CONTRIBUTOR_ORIGIN ?? 'http://127.0.0.1:4184'
const adminOrigin = process.env.HYPE_REVIEWER_ORIGIN ?? 'http://127.0.0.1:4183'
for (const origin of [userOrigin, adminOrigin])
  if (new URL(origin).hostname !== '127.0.0.1')
    throw Error('Only loopback test servers are allowed')
const artifacts = process.env.HYPE_BROWSER_ARTIFACTS ?? '/tmp/hype-contribution-browser'
await Bun.$`mkdir -p ${artifacts}`
const proxy = await getPlatformProxy({
  configPath: 'wrangler.local.toml',
  remoteBindings: false,
  persist: { path: fixture.state },
})
const b = await chromium.launch({ headless: true, args: ['--disable-web-security'] })
const title = `Agent browser contribution ${Date.now()}`
let puts = 0
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
  p.setDefaultTimeout(30000)
  p.on('pageerror', e => console.log('PAGEERROR', e.message))
  await p.route('https://*.r2.cloudflarestorage.com/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' || request.method() === 'HEAD')
      return route.continue()
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'PUT',
          'access-control-allow-headers': '*',
        },
      })
    if (request.method() !== 'PUT' || !url.pathname.startsWith('/hype-assets-raw-dev/'))
      throw Error('Unexpected storage write blocked')
    const bytes = request.postDataBuffer()
    if (!bytes) throw Error('Missing upload bytes')
    await (
      proxy.env.ASSET_RAW_DEV as {
        put(
          key: string,
          bytes: Uint8Array,
          options: { httpMetadata: { contentType?: string } },
        ): Promise<unknown>
      }
    ).put(
      decodeURIComponent(url.pathname.slice('/hype-assets-raw-dev/'.length)),
      bytes,
      { httpMetadata: { contentType: request.headers()['content-type'] } },
    )
    puts++
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await p.goto(userOrigin + '/features/new', { timeout: 90000 })
  await p
    .getByRole('button', { name: 'Find Other', exact: true })
    .click({ timeout: 60000 })
  await p.getByPlaceholder('Search organisations, projects, and layers').fill('Ghost')
  await p.getByRole('button', { name: /Current/ }).click()
  await p.getByRole('button', { name: 'Continue', exact: true }).click()
  await p.getByRole('button', { name: 'Select Location', exact: true }).click()
  await p
    .getByRole('button', { name: 'Use Location', exact: true })
    .waitFor({ timeout: 45000 })
  await p
    .getByLabel('Enter address...', { exact: true })
    .fill('146 Shanghai Street, Yau Ma Tei')
  await p.getByRole('button', { name: 'Use Location', exact: true }).click()
  await p.getByRole('button', { name: 'Edit title', exact: true }).click()
  await p.getByPlaceholder('Enter title...', { exact: true }).fill(title)
  await p.getByPlaceholder('Enter title...', { exact: true }).press('Enter')
  const bytes = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 27, g: 92, b: 136 },
    },
  })
    .jpeg()
    .toBuffer()
  await p
    .locator('input[type=file]:not([capture])')
    .first()
    .setInputFiles({
      name: 'agent-contribution-r32.jpg',
      mimeType: 'image/jpeg',
      buffer: bytes,
    })
  await p.waitForTimeout(1500)
  await p.screenshot({ path: artifacts + '/before-submit.png' })
  await p.getByRole('button', { name: 'Submit', exact: true }).click()
  await p
    .getByText('Submission Success', { exact: true })
    .waitFor({ timeout: 90000 })
    .catch(async e => {
      console.log('FAILED_SUBMIT', await p.locator('body').innerText())
      throw e
    })
  if (puts !== 1) throw Error('Expected one local-only original upload')
  const db = new Database(fixture.database, { readonly: true })
  const row = db
    .query(
      `SELECT t.id,t.featureId,t.isDraft,t.isReviewed,p.status FROM task t JOIN featureRevisionProposal p ON p.id=t.proposalId WHERE json_extract(p.changes,'$.content.translations.en.title.value')=? ORDER BY t.createdAt DESC LIMIT 1`,
    )
    .get(title) as {
    id: string
    featureId: string | null
    isDraft: number
    isReviewed: number
    status: string
  } | null
  db.close()
  if (!row || row.featureId !== null || row.isDraft !== 0 || row.status !== 'submitted')
    throw Error('Unexpected submitted contribution state')
  await Bun.write(
    artifacts + '/submitted.json',
    JSON.stringify({ task: row, localOnlyPuts: puts, remoteWrites: false }, null, 2),
  )
  console.log('SUBMITTED', row)
  await p.screenshot({ path: artifacts + '/submitted.png' })
  const reviewer = await b.newPage({ viewport: { width: 1440, height: 1000 } })
  await reviewer.goto(adminOrigin + '/admin/tasks/' + row.id, { timeout: 90000 })
  await reviewer
    .getByRole('button', { name: /^Accept( contribution)?$/ })
    .waitFor({ timeout: 60000 })
  await reviewer.screenshot({ path: artifacts + '/review.png' })
  await reviewer.getByRole('button', { name: /^Accept( contribution)?$/ }).click()
  const acceptedDb = new Database(fixture.database, { readonly: true })
  try {
    let accepted: {
      id: string
      featureId: string | null
      isReviewed: number
      reviewOutcome: string | null
      isPublished: number
      isArchived: number
      currentRevisionId: string
    } | null = null
    for (let attempt = 0; attempt < 120; attempt++) {
      accepted = acceptedDb
        .query(
          `SELECT t.id,t.featureId,t.isReviewed,t.reviewOutcome,f.isPublished,f.isArchived,f.currentRevisionId FROM task t LEFT JOIN feature f ON f.id=t.featureId WHERE t.id=?`,
        )
        .get(row.id) as typeof accepted
      if (accepted?.isReviewed) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (
      !accepted?.featureId ||
      accepted.reviewOutcome !== 'accepted' ||
      accepted.isPublished !== 0 ||
      accepted.isArchived !== 0
    )
      throw Error('Acceptance did not create an unpublished active Feature')
    const gallery = acceptedDb
      .query('SELECT imageId FROM featureImage WHERE featureId=?')
      .all(accepted.featureId)
    const evidence = acceptedDb
      .query('SELECT imageId FROM taskImage WHERE taskId=?')
      .all(row.id)
    if (gallery.length !== 1 || JSON.stringify(gallery) !== JSON.stringify(evidence))
      throw Error('Accepted gallery differs from contributed evidence')
    const foreignKeys = acceptedDb.query('PRAGMA foreign_key_check').all()
    if (foreignKeys.length) throw Error('Foreign key violations')
    await Bun.write(
      artifacts + '/accepted.json',
      JSON.stringify(
        {
          accepted,
          gallery,
          evidence,
          foreignKeys,
          localOnlyPuts: puts,
          remoteWrites: false,
        },
        null,
        2,
      ),
    )
    console.log('ACCEPTED_UNPUBLISHED', accepted.featureId)
  } finally {
    acceptedDb.close()
  }
} finally {
  await b.close()
  await proxy.dispose()
}
