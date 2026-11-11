// NODE
import { mkdir } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4174'
const featureId = process.argv[3] ?? '2xqr7Gjex9Tf'
if (!new URL(origin).hostname.match(/^(localhost|127\.0\.0\.1)$/))
  throw Error('Local verification only')
await mkdir('output/playwright/template-consumers', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  let assigned = false
  try {
    await page.goto(`${origin}/admin/templates?feature=${featureId}`)
    await page.getByRole('button', { name: /Establishment name/ }).waitFor()
    const owner = await page.evaluate(async id => {
      const remoteModule = '/src/lib/api/displayTemplates.remote.ts'
      const api = await import(remoteModule)
      const current = await api.getFeatureDisplayTemplate({ featureId: id })
      if (current.reference) throw Error('Use a Feature without a central reference')
      const template = current.templates.find(
        (item: { code: string }) => item.code === 'establishment-name',
      )
      if (!template) throw Error('Expected local establishment template')
      await api.setFeatureDisplayTemplate({
        featureId: id,
        expectedRevisionId: current.revisionId,
        expectedVersion: current.version,
        reference: { id: template.id, version: template.version },
      })
      return current.organisationId
    }, featureId)
    assigned = true
    await page.goto(`${origin}/admin/templates?organisation=${owner}`)
    await page.getByRole('button', { name: /Establishment name/ }).click()
    const section = page.getByRole('region', { name: 'Template consumers' })
    await section.getByRole('link').first().waitFor()
    await section.getByRole('button', { name: 'Regenerate listed features' }).click()
    await section.getByText('Regenerated', { exact: true }).waitFor()
    if (await section.getByText('Not saved · reload to retry').count())
      throw Error('Regeneration failed')
    await page.screenshot({
      path: `output/playwright/template-consumers/${name}.png`,
      fullPage: true,
    })
    console.log(`${name}: accepted consumer loads and regenerates through the admin UI`)
  } finally {
    if (assigned)
      await page.evaluate(async id => {
        const remoteModule = '/src/lib/api/displayTemplates.remote.ts'
        const api = await import(remoteModule)
        await api.getFeatureDisplayTemplate({ featureId: id }).refresh()
        const current = await api.getFeatureDisplayTemplate({ featureId: id })
        await api.setFeatureDisplayTemplate({
          featureId: id,
          expectedRevisionId: current.revisionId,
          expectedVersion: current.version,
          reference: null,
        })
      }, featureId)
    await browser.close()
  }
}
