// NODE
import { mkdir } from 'node:fs/promises'
// SQLITE
import { Database } from 'bun:sqlite'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = 'http://127.0.0.1:4184',
  featureId = '2xqr7Gjex9Tf'
const db = new Database(
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/d3080fe932e72db09a66987b4bc33e3301f57365daef263894a0551146999c8f.sqlite',
  { readonly: true },
)
await mkdir('output/playwright/community-contribution-save', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const original = db
    .query(
      `SELECT o.overrides FROM featureLocation fl JOIN feature f ON f.id=fl.featureId LEFT JOIN organisationLocationHead o ON o.locationId=fl.locationId AND o.organisationId=f.organisationId WHERE f.id=?`,
    )
    .get(featureId) as { overrides: string | null }
  const originalNames = JSON.parse(original.overrides ?? '{}').names ?? {}
  const browser = await engine.launch({
    args: name === 'chromium' ? ['--disable-web-security'] : [],
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
  page.on('response', async response => {
    if (response.url().includes('submitLocationCorrection'))
      console.log('cleanup', await response.text())
  })
  let before: { corrections: { names?: { choice: unknown } } } | null = null
  try {
    await page.routeWebSocket('**/*', () => {})
    await page.goto(`${origin}/admin/features/${featureId}`)
    before = await page.evaluate(async id => {
      const path = '/src/lib/api/locationShared.remote.ts',
        api = await import(path)
      return await api.getSharedLocationCorrection({ featureId: id })
    }, featureId)
    await page
      .locator('header')
      .getByRole('button', { name: 'Location', exact: true })
      .first()
      .click()
    for (const mode of ['community', 'internal'] as const) {
      await page
        .locator('header')
        .getByRole('button', { name: 'Edit', exact: true })
        .first()
        .click()
      const control = page.getByLabel('Names edits', { exact: true })
      await control.waitFor()
      await control.selectOption(mode)
      await page
        .locator('[data-draft-location-name]')
        .locator('button:enabled')
        .first()
        .click()
      const value = `Local acceptance check ${name} ${mode}`
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(value)
      const response = page.waitForResponse(
        response =>
          response.request().method() === 'POST' &&
          response.url().includes('featureForm'),
      )
      await page
        .locator('header')
        .getByRole('button', { name: 'Save', exact: true })
        .first()
        .click()
      await response
      await page
        .locator('header')
        .getByRole('button', { name: 'Edit', exact: true })
        .first()
        .waitFor()
      const state = await page.evaluate(async id => {
        const path = '/src/lib/api/locationShared.remote.ts',
          api = await import(path)
        const locationPath = '/src/lib/api/location.remote.ts',
          location = await import(locationPath)
        await api.getSharedLocationCorrection({ featureId: id }).refresh()
        await location.getFeatureLocation({ featureId: id }).refresh()
        return {
          shared: await api.getSharedLocationCorrection({ featureId: id }),
          accepted: await location.getFeatureLocation({ featureId: id }),
        }
      }, featureId)
      if (state.accepted.effective.names.en !== value)
        throw Error(`${mode}: accepted name missing`)
      if (mode === 'community' && state.shared.facts.names.en !== value)
        throw Error('Community name not contributed')
      if (
        mode === 'internal' &&
        state.shared.facts.names.en !== `Local acceptance check ${name} community`
      )
        throw Error('Internal edit leaked to community')
      await page.screenshot({
        path: `output/playwright/community-contribution-save/${name}-${mode}.png`,
        fullPage: true,
      })
    }
    console.log(
      `${name}: real Community and Internal saves preserve their destinations`,
    )
  } finally {
    if (before)
      await page.evaluate(
        async ({ id, source, originalNames }) => {
          const path = '/src/lib/api/locationShared.remote.ts',
            api = await import(path)
          await api.getSharedLocationCorrection({ featureId: id }).refresh()
          const current = await api.getSharedLocationCorrection({ featureId: id })
          await api.saveSharedLocationDirectoryCorrection({
            locationId: current.locationId,
            sourceRevisionId: current.sourceRevisionId,
            expectedRevision: current.revision,
            patch: { names: source.corrections.names?.choice ?? { mode: 'inherit' } },
          })
          const correctionPath = '/src/lib/api/locationCorrections.remote.ts',
            correction = await import(correctionPath)
          await correction.getLocationCorrectionWorkspace({ featureId: id }).refresh()
          const workspace = await correction.getLocationCorrectionWorkspace({
            featureId: id,
          })
          const locales = new Set([
            ...Object.keys(workspace.current.names),
            ...Object.keys(originalNames),
          ])
          await correction.submitLocationCorrection({
            featureId: id,
            meta: { isAdminRequest: true },
            expectedAssociationVersion: workspace.version,
            expectedOrganisationRevision: workspace.organisationRevision,
            patch: {
              names: Object.fromEntries(
                [...locales].map(locale => [
                  locale,
                  originalNames[locale] ?? { mode: 'inherit' },
                ]),
              ),
            },
            reason: 'Restore local acceptance-check names',
          })
        },
        { id: featureId, source: before, originalNames },
      )
    await browser.close()
  }
}
db.close()
