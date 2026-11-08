// NODE
import { readFileSync } from 'node:fs'
// TOOLING
import ts from 'typescript'
import { chromium, firefox } from 'playwright'

// Exercise production tab/history handlers against native browser history without admin credentials.
const header = readFileSync(
  'src/lib/adapters/header/useAdminHeaderModel.svelte.ts',
  'utf8',
)
const forms = readFileSync('src/lib/client/services/form.ts', 'utf8')
const select = header.slice(
  header.indexOf('  function handleFacetChange('),
  header.indexOf('\n  // ---', header.indexOf('  function handleFacetChange(')),
)
const sync = forms
  .slice(
    forms.indexOf('export function syncAdminFacetFromHash'),
    forms.indexOf(
      '/**\n * Keeps admin facet state',
      forms.indexOf('export function syncAdminFacetFromHash'),
    ),
  )
  .replace('export function', 'function')
const source = ts.transpileModule(select + '\n' + sync, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.route('**/__facet-history', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<main><button id="core">Profile</button><button id="location">Location</button><button id="images">Images</button><output id="active">core</output></main>',
      }),
    )
    await page.goto('http://hype.localhost/__facet-history')
    await page.evaluate(code => {
      new Function(`
        const page = { state: { draft: 'preserved' } };
        const adminCtx = { activeFacet: 'core', setFacet(ref) { this.activeFacet = ref; document.querySelector('#active').textContent = ref; } };
        const goto = (url, options) => history[options.replace ? 'replaceState' : 'pushState'](options.state, '', url);
        ${code}
        for (const button of document.querySelectorAll('button')) button.onclick = () => handleFacetChange(button.id);
        window.addEventListener('popstate', () => syncAdminFacetFromHash({ hash: location.hash, activeFacet: adminCtx.activeFacet, facetOrder: ['core', 'location', 'images'], adminCtx, resourceType: 'feature', resourceRef: 'f' }));
      `)()
    }, source)
    await page.click('#location')
    await page.click('#images')
    const length = await page.evaluate(() => history.length)
    await page.click('#images')
    if ((await page.evaluate(() => history.length)) !== length)
      throw new Error('Duplicate tab added history')
    await page.goBack()
    await page.waitForFunction(
      () => document.querySelector('#active')?.textContent === 'location',
    )
    await page.goBack()
    await page.waitForFunction(
      () =>
        document.querySelector('#active')?.textContent === 'core' &&
        location.hash === '',
    )
    await page.goForward()
    await page.waitForFunction(
      () => document.querySelector('#active')?.textContent === 'location',
    )
    await page.goForward()
    await page.waitForFunction(
      () => document.querySelector('#active')?.textContent === 'images',
    )
    if ((await page.evaluate(() => history.state.draft)) !== 'preserved')
      throw new Error('Tab navigation dropped draft state')
    console.log(
      `${name}: Back/Forward traverses tabs, hashless Profile, no duplicate entries, state preserved`,
    )
  } finally {
    await browser.close()
  }
}
