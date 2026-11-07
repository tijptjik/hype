import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const directory = 'output/playwright/review-dialogs'
await mkdir(directory, { recursive: true })
// Synthetic immutable sources keep all mutations and images inside this fixture.
const makeSource = (id: string, title: string) => ({
  featureId: id,
  revisionId: `revision-${id}`,
  generation: 1,
  content: {
    profile: {
      isIntangible: false,
      visitability: { isVisitable: true, asOf: '2026-11-07' },
    },
    translations: {
      'zh-hant': {
        title: { value: `${title} 中文` },
        description: { value: '社區中心' },
        address: { value: '沙灣徑' },
      },
      en: {
        title: { value: title },
        description: { value: 'Community centre' },
        address: { value: '5–7 Sha Wan Drive, Sandy Bay' },
      },
    },
    properties: {
      category: {
        selection: {
          propertyValueId: `option-${id}`,
          value: null,
          valueJson: null,
          definition: {
            key: 'category',
            type: 'classifier',
            dataType: 'text',
            component: 'SelectField',
            isTranslatable: false,
            labels: { en: { value: 'Category' } },
            selectedOption: {
              id: `option-${id}`,
              value: id === 'primary' ? 'Existing category' : 'New category',
              translations: {},
            },
          },
        },
        translations: {},
      },
      notes: {
        selection: {
          propertyValueId: null,
          value: null,
          valueJson: null,
          definition: {
            key: 'notes',
            type: 'specifier',
            dataType: 'text',
            component: 'TextField',
            isTranslatable: true,
            labels: { en: { value: 'Notes' } },
            selectedOption: null,
          },
        },
        translations: {
          en: { value: `${id} note` },
          'zh-hant': { value: `${id} 中文備註` },
        },
      },
      rank: {
        selection: {
          propertyValueId: null,
          value: id === 'primary' ? '1' : '2',
          valueJson: null,
          definition: {
            key: 'rank',
            type: 'specifier',
            dataType: 'number',
            component: 'NumberField',
            isTranslatable: false,
            labels: { en: { value: 'Rank' } },
            selectedOption: null,
          },
        },
        translations: {},
      },
    },
    placement: {
      location: null,
      geometry: {
        type: 'Point',
        coordinates: id === 'primary' ? [114.11, 22.26] : [114.16, 22.32],
      },
    },
    gallery: {
      order: [`photo-${id}`],
      entries: {
        [`photo-${id}`]: { imageRevisionId: `image-${id}`, intent: 'canonical' },
      },
    },
  },
})
const sources = [
  makeSource('primary', 'Existing community centre'),
  { ...makeSource('candidate', 'Contributed community centre'), proposalOnly: true },
]
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch(
    name === 'chromium' ? { args: ['--disable-web-security'] } : {},
  )
  try {
    for (const width of [1280, 390]) {
      for (const theme of ['breadline-light', 'hype-dark']) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } })
        page.setDefaultTimeout(15000)
        const errors: string[] = []
        page.on('console', message => {
          if (message.type() === 'error') {
            console.log('Console:', message.text())
            if (message.text().includes('duplicate view-transition-name'))
              errors.push(message.text())
          }
        })
        page.on('pageerror', error => {
          errors.push(error.message)
          console.log(error.message)
        })
        await page.addInitScript(() => {
          const original = document.startViewTransition?.bind(document)
          const snapshots: any[] = []
          Object.assign(window, { __dialogSnapshots: snapshots })
          if (original)
            document.startViewTransition = (update: any) => {
              const current = document.querySelector(
                '[style*="view-transition-name: feature-review-dialog"]',
              )
              const snapshot: any = {
                before: current?.tagName ?? null,
                beforeBox: current?.getBoundingClientRect().toJSON(),
              }
              snapshots.push(snapshot)
              const transition = original(async () => {
                await update()
                const next = document.querySelector('[role="dialog"]')
                snapshot.after = next?.getAttribute('style') ?? null
                snapshot.afterBox = next?.getBoundingClientRect().toJSON()
              })
              void transition.ready.then(
                () => {
                  snapshot.ready = true
                },
                () => {
                  snapshot.ready = false
                },
              )
              void transition.finished.then(
                () => {
                  snapshot.finished = true
                },
                () => {
                  snapshot.finished = true
                },
              )
              return transition
            }
        })
        await page.route('**/src/lib/api/property.remote.ts*', route =>
          route.fulfill({
            contentType: 'text/javascript',
            body: `export async function getProperty(){return {data:{id:'category',values:[{id:'option-primary',value:'Existing category',i18n:{}},{id:'option-candidate',value:'New category',i18n:{}},{id:'option-third',value:'Third catalogue choice',i18n:{}}]}}} export async function getProperties(){return {data:[]}} export async function getProjectProperties(){return {data:[]}} export async function getPropertyValueAppendAccess(){return {data:null}} export async function createProjectProperty(){throw Error('Unexpected fixture write')} export async function appendPropertyValues(){throw Error('Unexpected fixture write')}`,
          }),
        )
        await page.route('https://tiles.saanseoi.hk/**', route =>
          route.fulfill({
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({
              tilejson: '3.0.0',
              tiles: ['https://review-map.invalid/{z}/{x}/{y}.pbf'],
              minzoom: 0,
              maxzoom: 14,
            }),
          }),
        )
        await page.route('https://review-map.invalid/**', route =>
          route.fulfill({
            status: 204,
            headers: { 'access-control-allow-origin': '*' },
            body: '',
          }),
        )
        await page.route('**/src/lib/api/featureIndex.remote.ts*', route =>
          route.fulfill({
            contentType: 'text/javascript',
            body: `export async function getFeatureIndexPage(){return {data:[{id:'primary',image:{ctxType:'feature',ctxId:'primary',image:{id:'primary-photo',publicId:'review-dialog/primary',cdn:'cloudflareR2',env:'local',version:1}},i18n:{en:{title:'Existing community centre',displayAddress:'5–7 Sha Wan Drive, Sandy Bay'}}}]}}`,
          }),
        )
        await page.route('**/src/lib/api/featureCreationDuplicate.remote.ts*', route =>
          route.fulfill({
            contentType: 'text/javascript',
            body: `export async function inspectCreationDuplicate(){return {proposalId:'proposal',version:'v1',modifiedAt:'now',sources:${JSON.stringify(sources)}}} export async function applyCreationDuplicate(input){window.__applied=input;return {outputs:['primary']}}`,
          }),
        )
        await page.route('**/api/images/revisions/**', route =>
          route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#57776a"/></svg>',
          }),
        )
        await page.route('**/review-dialog/**', route =>
          route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#57776a"/></svg>',
          }),
        )
        await page.route('**/__review-dialogs.html', route =>
          route.fulfill({
            contentType: 'text/html',
            body: `<html lang="en" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/reviewDialogsCheck.ts"></script></body></html>`,
          }),
        )
        await page.goto(`${base}/__review-dialogs.html`)
        page.on('crash', () => console.log('Browser page crashed'))
        const rejectTrigger = page.getByRole('button', {
          name: 'Reject contribution',
          exact: true,
        })
        console.log('Opening rejection', name, width, theme)
        await rejectTrigger.click()
        const dialog = page.getByRole('dialog')
        await dialog.getByRole('heading', { name: 'Reason for rejection' }).waitFor()
        await page.waitForFunction(
          () =>
            !document.documentElement
              .getAnimations({ subtree: true })
              .some(animation => animation.playState === 'running'),
        )
        const background = await dialog.evaluate(
          node => getComputedStyle(node).backgroundColor,
        )
        if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent')
          throw Error('Transparent dialog')
        await page.waitForFunction(() =>
          (window as any).__dialogSnapshots.every((snapshot: any) => snapshot.finished),
        )
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-reject.png`,
        })
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await rejectTrigger.focus()
        await rejectTrigger.press('Enter')
        await page
          .getByRole('textbox', { name: 'Reason for rejection' })
          .fill('Fixture reason')
        await page
          .getByRole('textbox', { name: 'Reason for rejection' })
          .press('Control+Enter')
        await page.locator('[data-rejected]').filter({ hasText: '1' }).waitFor()
        await dialog.waitFor({ state: 'hidden' })
        await page
          .getByRole('button', { name: 'Duplicate contribution', exact: true })
          .click()
        await dialog
          .getByRole('heading', { name: 'Duplicate Feature', exact: true })
          .waitFor()
        const persistentId = await dialog.getAttribute('id')
        const choiceWidth = (await dialog.boundingBox())!.width
        if (await dialog.locator('footer').count()) throw Error('Chooser has a footer')
        const mergeButton = await dialog
          .getByRole('button', { name: 'Merge with existing', exact: true })
          .boundingBox()
        const discardButton = await dialog
          .getByRole('button', { name: 'Discard', exact: true })
          .boundingBox()
        if (
          !mergeButton ||
          !discardButton ||
          Math.abs(mergeButton.y - discardButton.y) > 1
        )
          throw Error('Chooser actions are not one row')
        if (mergeButton.x <= discardButton.x)
          throw Error('Positive action is not on the right')
        await page.waitForFunction(() =>
          (window as any).__dialogSnapshots.every((snapshot: any) => snapshot.finished),
        )
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-duplicate.png`,
        })
        await dialog
          .getByRole('button', { name: 'Merge with existing', exact: true })
          .click()
        await dialog.getByLabel('Find the existing Feature').fill('community')
        const result = page.locator('[data-entity-id="primary"]')
        await result.waitFor()
        await page.waitForFunction(() => {
          const image = document.querySelector('[data-entity-id="primary"] img')
          return (
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0
          )
        })
        if (await result.locator('[class*="stats"]').count())
          throw Error('Search row has progress pips')
        await page.waitForFunction(() =>
          (window as any).__dialogSnapshots.every((snapshot: any) => snapshot.finished),
        )
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-search.png`,
        })
        if (Math.abs((await dialog.boundingBox())!.width - choiceWidth) > 1)
          throw Error('Search did not retain compact width')
        if (await dialog.locator('footer').count()) throw Error('Search has a footer')
        await result.focus()
        await result.press('Enter')
        await dialog
          .getByText('both maps use the same scale', { exact: false })
          .waitFor()
        if (await dialog.getByLabel('Find the existing Feature').count())
          throw Error('Search repeated in merge review')
        if ((await dialog.getAttribute('id')) !== persistentId)
          throw Error('Dialog remounted between steps')
        if (await dialog.evaluate(node => node.scrollWidth > node.clientWidth))
          throw Error('Dialog horizontal overflow')
        await dialog
          .getByRole('button', { name: 'Replace kept Feature', exact: true })
          .click()
        await dialog.getByLabel('Find the existing Feature').fill('community')
        await result.click()
        await dialog
          .getByText('both maps use the same scale', { exact: false })
          .waitFor()
        await page.waitForFunction(() =>
          (window as any).__dialogSnapshots.every((snapshot: any) => snapshot.finished),
        )
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-comparison-top.png`,
        })
        await dialog
          .getByRole('region', { name: 'Discard location', exact: true })
          .waitFor()
        await dialog
          .getByRole('region', { name: 'Keep location', exact: true })
          .waitFor()
        await dialog
          .getByText('8.4 km apart · both maps use the same scale', { exact: true })
          .waitFor()
        await page.waitForFunction(() => {
          const markers = [...document.querySelectorAll('.maplibregl-marker')]
          return (
            markers.length >= 2 &&
            markers.every(marker => !marker.closest('.opacity-0'))
          )
        })
        if (await dialog.locator('[data-merge-locale]').count())
          throw Error('Locale prefix shown while multilingual is off')
        if ((await dialog.boundingBox())!.width > 900)
          throw Error('Comparison is too wide')
        const controls = dialog.locator('input,textarea,select')
        if (
          !(await controls.evaluateAll(nodes =>
            nodes.every(node =>
              ['transparent', 'rgba(0, 0, 0, 0)'].includes(
                getComputedStyle(node).backgroundColor,
              ),
            ),
          ))
        )
          throw Error('Comparison controls have a coloured background')
        await dialog
          .getByRole('button', { name: 'Import title en', exact: true })
          .click()
        if (
          (await dialog.getByLabel('Keep name en', { exact: true }).inputValue()) !==
          'Contributed community centre'
        )
          throw Error('Name import failed')
        await dialog
          .getByRole('button', { name: 'Undo import title en', exact: true })
          .click()
        if (
          (await dialog
            .getByRole('button', { name: 'Import description en', exact: true })
            .getAttribute('data-import-state')) !== 'equal'
        )
          throw Error('Equal fields were not marked')
        await dialog.getByRole('button', { name: 'Multilingual', exact: true }).click()
        await dialog.getByLabel('Keep name zh-hant', { exact: true }).waitFor()
        await dialog
          .getByLabel('Keep description zh-hant', { exact: true })
          .fill('審閱後的說明')
        await dialog
          .getByLabel('Keep Category category', { exact: true })
          .selectOption('option-third')
        await dialog
          .getByLabel('Keep Notes value en', { exact: true })
          .fill('Reviewed note')
        await dialog.getByLabel('Keep Rank value en', { exact: true }).fill('3')
        await dialog.getByLabel('Keep Visits', { exact: true }).selectOption('false')
        await page.waitForFunction(() =>
          (window as any).__dialogSnapshots.every((snapshot: any) => snapshot.finished),
        )
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-merge.png`,
        })
        await dialog
          .getByRole('button', {
            name: 'Move photo photo-candidate to Keep',
            exact: true,
          })
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-photos-before.png`,
        })
        await dialog
          .getByRole('button', { name: 'Photo intent photo-candidate', exact: true })
          .click()
        await page.getByRole('button', { name: 'Context', exact: true }).click()
        await dialog
          .getByRole('button', {
            name: 'Move photo photo-candidate to Keep',
            exact: true,
          })
          .click()
        await dialog
          .getByRole('button', { name: 'Photo intent photo-candidate', exact: true })
          .click()
        await page.getByRole('button', { name: 'Featured', exact: true }).click()
        if (
          !(
            await dialog
              .getByRole('button', { name: 'Photo intent photo-primary', exact: true })
              .innerText()
          )
            .toLowerCase()
            .includes('general')
        )
          throw Error('Cover selection was not unique')
        await dialog
          .getByRole('button', {
            name: 'Move photo photo-primary to Discard',
            exact: true,
          })
          .click()
        await dialog
          .getByRole('button', {
            name: 'Move photo photo-primary to Keep',
            exact: true,
          })
          .click()
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}-photos-after.png`,
        })
        await dialog
          .getByRole('button', { name: 'Merge Features', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        const applied = await page.evaluate(() => (window as any).__applied)
        const output = applied.selection.outputs[0]
        if (
          output.sourceFeatureId !== 'primary' ||
          output.propertyOptionEdits.category !== 'option-third'
        )
          throw Error('Kept identity or field source changed')
        if (
          output.propertyTranslationEdits.notes.en !== 'Reviewed note' ||
          output.propertyEdits.rank !== '3' ||
          output.descriptions['zh-hant'] !== '審閱後的說明'
        )
          throw Error('Field edits were lost')
        if (
          output.images.length !== 2 ||
          output.coverImageId !== 'photo-candidate' ||
          output.images.find((image: any) => image.imageId === 'photo-primary')
            .intent !== 'general'
        )
          throw Error('Gallery choices were lost')
        const snapshots = await page.evaluate(() => (window as any).__dialogSnapshots)
        if (
          (await page.evaluate(() => Boolean(document.startViewTransition))) &&
          !snapshots.some(
            (snapshot: any) =>
              snapshot.ready &&
              snapshot.before === 'BUTTON' &&
              snapshot.after?.includes('feature-review-dialog'),
          )
        )
          throw Error('No button-to-dialog transition')
        if (
          (await page.evaluate(() => Boolean(document.startViewTransition))) &&
          !snapshots.some(
            (snapshot: any) =>
              snapshot.ready &&
              snapshot.before === 'DIV' &&
              snapshot.beforeBox &&
              snapshot.afterBox &&
              Math.abs(snapshot.beforeBox.height - snapshot.afterBox.height) > 20,
          )
        )
          throw Error('No successful dialog size morph')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const prior = snapshots.length
        await rejectTrigger.click()
        await dialog.getByRole('heading', { name: 'Reason for rejection' }).waitFor()
        if (
          (await page.evaluate(() => (window as any).__dialogSnapshots.length)) !==
          prior
        )
          throw Error('Reduced motion animated')
        if (errors.length) throw Error(errors.join('\n'))
        console.log(
          JSON.stringify({
            name,
            width,
            theme,
            opaque: background,
            persistentDialog: true,
            transitions: snapshots.length,
            keyboard: true,
            loadedThumbnail: true,
            reducedMotion: true,
          }),
        )
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
