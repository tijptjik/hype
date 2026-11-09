// Manual browser verification of the actual discovery/picker components, with bounded provider fixtures.
import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'

await mkdir('output/playwright', { recursive: true })
const failures: string[] = []
const baseUrl = process.env.ASSOCIATION_BASE_URL ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  if (process.env.ASSOCIATION_BROWSER && process.env.ASSOCIATION_BROWSER !== name)
    continue
  const browser = await engine.launch({
    ...(name === 'chromium'
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--disable-web-security'] }
      : { executablePath: process.env.FIREFOX_PATH }),
  })
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  try {
    page.setDefaultTimeout(15000)
    if (process.env.ASSOCIATION_SCOPE === 'ranking')
      await page.addInitScript(() =>
        localStorage.setItem('hype:location-association:expanded', 'false'),
      )
    page.on('pageerror', error => {
      failures.push(`${name}: ${error.message}`)
      console.error(error)
    })
    page.on('console', message => {
      if (message.text().includes('binding_property_non_reactive'))
        failures.push(`${name}: ${message.text()}`)
    })
    const address = {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: { en: '118 Queen Road' },
      authored: {
        scope: 'building',
        i18n: {
          en: {
            formattedAddress: '',
            streetName: 'Queen Road',
            buildingNumberExpression: '118',
            buildingNumberFrom: '118',
          },
        },
        unit: null,
        unitI18n: {},
      },
    }
    const facts = {
      names: { en: 'Hollywood Cafe' },
      phoneNumber: [],
      brands: [],
      location: { geometry: { type: 'Point', coordinates: [114.1501, 22.3] }, address },
    }
    await page.route('**/src/lib/api/draftLocation.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export async function searchDraftLocations(){return {rows:[{id:'cafe',resourceReleaseId:'fixture',facts:${JSON.stringify(facts)}}],partial:false,limited:false}}; export const searchNearbyDraftLocations=searchDraftLocations`,
      }),
    )
    await page.route('**/src/lib/api/locationAssociation.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export async function searchDraftAssociationLocations(input){return {rows:input.kind==='premises'?[{locationId:'premises',revisionId:'p1',kind:'premises',facts:${JSON.stringify({ ...facts, names: { en: 'Hollywood Terrace' } })}}]:[],limited:false}}`,
      }),
    )
    const building = {
      id: 'building:tower-b',
      kind: 'building',
      names: { en: 'Hollywood Terrace Tower B' },
      buildingSource: { id: 'tower-b', release: 'fixture' },
      address: {
        version: 1,
        matchStatus: 'unresolved',
        coordinates: [114.1501, 22.3],
        overrides: {},
        source: {
          ...address,
          authored: {
            ...address.authored,
            i18n: {
              en: {
                ...address.authored.i18n.en,
                buildingName: 'Hollywood Terrace Tower B',
              },
            },
          },
        },
      },
    }
    await page.route('**/src/lib/locations/buildingSearch.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export async function searchBuildingNames(){return [${JSON.stringify(building)}]}; export async function searchBuildingNamesPage(){const rows=await searchBuildingNames();return {rows,total:rows.length,nextCursor:null}}`,
      }),
    )
    await page.route('**/src/lib/addresses/nameCatalogue.ts*', async route => {
      if (route.request().url().includes('fixture-source')) {
        await route.continue()
        return
      }
      await route.fulfill({
        contentType: 'text/javascript',
        body: `export { AddressNameSchema, setAddressName, structurePlaceAddress } from '/src/lib/addresses/nameCatalogue.ts?fixture-source=1'; export async function loadAddressNames(family){return family==='streets'?[{id:'street-correct',names:{en:'Correct Road','zh-Hant':'正確道','zh-Hans':'正确道'},divisionCodes:[]}]:[{id:'building-known',names:{en:'Known Tower','zh-Hant':'已知大廈'},divisionCodes:[]}]}`,
      })
    })
    await page.route('**/src/lib/api/division.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function getAddressDivisionLabel(){return {current:null}}; export async function getAddressDivisionContext(){return {available:true,memberships:[],options:[]}}; export async function getDivisionGeometry(){return null}',
      }),
    )
    await page.route('**/__location-association.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationAssociationCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${baseUrl}/__location-association.html`, {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('[data-association-fixture]').evaluate(element => {
      element.style.maxWidth = 'none'
    })
    if (process.env.ASSOCIATION_SCOPE === 'ranking') {
      const entries = ['14', '11-16', '13', '15', '12', '16', '11'].map(number => ({
        id: `building:fu:${number}`,
        kind: 'building',
        names: { en: 'Fu Yee Court' },
        buildingSource: { id: 'fu', release: 'fixture', addressId: number },
        address: {
          version: 1,
          matchStatus: 'unresolved',
          coordinates: [114.1501, 22.3],
          overrides: {
            en: {
              buildingName: 'Fu Yee Court',
              streetName: 'Ferry Street',
              buildingNumberFrom: number.split('-')[0],
              buildingNumberTo: number.split('-')[1] ?? '',
            },
          },
          source: { ...address, authored: { ...address.authored, i18n: {} } },
        },
      }))
      await page.route('**/src/lib/locations/buildingSearch.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `export async function searchBuildingNames(){return ${JSON.stringify(entries)}}; export async function searchBuildingNamesPage(){const rows=await searchBuildingNames();return {rows,total:rows.length,nextCursor:null}}`,
        }),
      )
      await page.goto(
        `${baseUrl}/__location-association.html?exact=1${process.env.ASSOCIATION_PIN_EDIT ? '&map=1' : ''}`,
        {
          waitUntil: 'domcontentloaded',
        },
      )
      await page.locator('[data-result-id]').click()
      await page
        .getByRole('button', { name: 'Locate feature here', exact: true })
        .click()
      await page
        .locator('[role="radio"][aria-checked="true"]')
        .filter({ hasText: 'Building' })
        .waitFor()
      if (process.env.ASSOCIATION_PIN_EDIT) {
        await page.getByRole('button', { name: 'Edit', exact: true }).click()
        const marker = page.locator('[data-location-candidate="building:fu:11-16"]')
        await marker.waitFor()
        await page.waitForTimeout(700)
        const before = JSON.parse(
          (await page
            .locator('[data-association-fixture]')
            .getAttribute('data-markers')) ?? '[]',
        )
        const box = await marker.boundingBox()
        if (!box) throw Error('Missing editable map marker')
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 + 20, {
          steps: 12,
        })
        await page.mouse.up()
        await page.getByRole('button', { name: /Custom position$/ }).waitFor()
        const after = JSON.parse(
          (await page
            .locator('[data-association-fixture]')
            .getAttribute('data-markers')) ?? '[]',
        )
        if (
          JSON.stringify(before.map(row => row.coordinates)) ===
          JSON.stringify(after.map(row => row.coordinates))
        )
          throw Error('Dragging did not change draft coordinates')
        await page.getByRole('button', { name: 'Done', exact: true }).click()
        const card = await page.locator('[data-association-name]').boundingBox()
        const replace = await page
          .getByRole('button', { name: 'Change selection', exact: true })
          .boundingBox()
        const reset = await page
          .getByRole('button', { name: 'Reset Building Position', exact: true })
          .boundingBox()
        if (
          !card ||
          card.height > 60 ||
          !replace ||
          !reset ||
          Math.abs(replace.x - reset.x) > 2
        )
          throw Error(
            'Comparison card is too tall or replace/reset actions are misaligned',
          )
        await page.screenshot({
          path: `output/playwright/association-${name}-custom-pin.png`,
        })
        await page
          .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
          .click()
        const accepted = JSON.parse(
          (await page
            .locator('[data-association-fixture]')
            .getAttribute('data-selected')) ?? 'null',
        )
        if (
          accepted.address.association.mode !== 'unlinked' ||
          accepted.buildingSource ||
          accepted.identity ||
          accepted.source
        )
          throw Error('Moved pin retained a source Location identity')
        console.log(
          JSON.stringify({ browser: name, customPinDrag: true, detachedSource: true }),
        )
        continue
      }
      if (
        (await page
          .getByRole('radio', { name: 'Building', exact: true })
          .getAttribute('aria-checked')) !== 'true' ||
        (await page.locator('[data-address-choice]').count())
      )
        throw new Error(`${name}: exact match was not preselected cleanly`)
      for (const viewport of [
        { width: 1294, height: 710 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport)
        await page.waitForTimeout(500)
        const alignment = await page
          .locator('[data-association-columns]')
          .evaluate(columns => {
            const box = columns.getBoundingClientRect()
            const centre = box.x + box.width / 2
            const labels = columns.parentElement?.querySelectorAll(
              '[data-association-side]',
            )
            const actions = columns
              .closest('[data-location-association-picker]')
              ?.querySelector('[data-association-actions]')?.children
            const initialAction = actions?.[0]?.getBoundingClientRect()
            const recommendedAction = actions?.[1]?.getBoundingClientRect()
            const buttonsAligned = Boolean(
              initialAction &&
                recommendedAction &&
                initialAction.right < centre &&
                recommendedAction.left > centre &&
                Math.abs((initialAction.right + recommendedAction.left) / 2 - centre) <
                  2,
            )
            const header = columns
              .querySelector('[data-association-record-headers]')
              ?.children[1]?.getBoundingClientRect()
            const pin = columns
              .querySelector('[data-marker-choice-controls]')
              ?.getBoundingClientRect()
            const picker = columns
              .closest('[data-location-association-picker]')
              ?.getBoundingClientRect()
            const heading = document.querySelector('[data-association-heading]')
            const title = heading?.querySelector('h2')?.getBoundingClientRect()
            const subtitle = heading
              ?.querySelector(':scope > p')
              ?.getBoundingClientRect()
            return {
              labelsRemoved: labels?.length === 0,
              buttonsAligned,
              centred: [header, pin, picker, title, subtitle].every(
                rect => rect && Math.abs(rect.x + rect.width / 2 - centre) < 2,
              ),
            }
          })
        if (!alignment.labelsRemoved || !alignment.buttonsAligned || !alignment.centred)
          throw Error(`${name}: comparison labels remain or its buttons are off-centre`)
        const accept = page
          .locator('[data-association-footer]')
          .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
        await accept.waitFor()
        const bounds = await accept.boundingBox()
        const marker = await page
          .locator('[data-association-marker-choice]')
          .boundingBox()
        if (
          viewport.width > 640 &&
          marker &&
          bounds &&
          marker.y + marker.height > bounds.y
        )
          throw new Error(
            `${name}: marker comparison is hidden behind the acceptance footer`,
          )
        if (!bounds || bounds.y < 0 || bounds.y + bounds.height > viewport.height)
          throw new Error(`${name}: acceptance button is outside the viewport`)
        if (
          await page
            .locator('[data-association-name] button')
            .filter({ hasText: 'Use Location' })
            .count()
        )
          throw new Error(`${name}: acceptance remains inside candidate`)
        if (
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        )
          throw new Error(`${name}: comparison overflows`)
        await page.screenshot({
          path: `output/playwright/association-${name}-comparison-${viewport.width}.png`,
        })
      }
      const profiler =
        process.env.ASSOCIATION_PROFILE && name === 'chromium'
          ? await page.context().newCDPSession(page)
          : null
      if (profiler) {
        await profiler.send('Profiler.enable')
        await profiler.send('Profiler.start')
      }
      const handoff = await page
        .getByRole('button', { name: 'Change selection', exact: true })
        .evaluate(async button => {
          const started = performance.now()
          button.click()
          const clickMs = performance.now() - started
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          return {
            elapsedMs: Math.round(performance.now() - started),
            clickMs: Math.round(clickMs),
            resultsInFirstFrame: Boolean(
              document
                .querySelector<HTMLElement>('[data-association-results]')
                ?.checkVisibility(),
            ),
          }
        })
      if (profiler) {
        const { profile } = await profiler.send('Profiler.stop')
        const counts = new Map<number, number>()
        for (const id of profile.samples ?? [])
          counts.set(id, (counts.get(id) ?? 0) + 1)
        console.log(
          JSON.stringify(
            profile.nodes
              .map(node => ({ count: counts.get(node.id) ?? 0, ...node.callFrame }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 15),
          ),
        )
        await profiler.detach()
      }
      if (!handoff.resultsInFirstFrame)
        throw Error(`${name}: cached alternatives missed the first render frame`)
      console.log(JSON.stringify({ browser: name, ...handoff }))
      const rows = page.locator('[data-association-result]')
      if (
        (await rows.first().getAttribute('data-association-result')) !==
        'building:fu:11-16'
      )
        throw new Error(`${name}: exact range is not ranked first`)
      await page.locator('[data-association-footer] [data-association-ghost]').waitFor()
      for (const viewport of [
        { width: 1300, height: 850 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport)
        if (
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        )
          throw new Error(`${name}: ranking overflows`)
        await page.screenshot({
          path: `output/playwright/association-${name}-ranking-${viewport.width}.png`,
        })
      }
      await rows.first().click()
      await page
        .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
        .click()
      const selected = JSON.parse(
        (await page.locator('[data-selected]').getAttribute('data-selected'))!,
      )
      if (selected.buildingSource.addressId !== '11-16')
        throw new Error(`${name}: wrong address identity accepted`)
      console.log(
        JSON.stringify({
          browser: name,
          exactPreselection: true,
          rankedRangeFirst: true,
          footer: 'fixed',
          narrowOverflow: false,
        }),
      )
      continue
    }
    if (process.env.ASSOCIATION_SCOPE === 'map-results') {
      // A long asynchronous result list must scroll without consuming the map's height.
      const rows = Array.from({ length: 30 }, (_, index) => ({
        id: `cafe-${index}`,
        resourceReleaseId: 'fixture',
        facts: { ...facts, names: { en: `Hollywood Cafe ${index + 1}` } },
      }))
      await page.route('**/src/lib/api/draftLocation.remote.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `export async function searchDraftLocations(){return {rows:${JSON.stringify(rows)},partial:false,limited:false}}; export const searchNearbyDraftLocations=searchDraftLocations`,
        }),
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      const separator = page.getByRole('separator', { name: 'Resize map' })
      const initialHeight = await separator.getAttribute('aria-valuenow')
      await page.locator('[data-result-id]').click()
      await page
        .getByRole('button', { name: 'Locate feature here', exact: true })
        .click()
      await page.getByRole('radio', { name: 'Establishment', exact: true }).click()
      await page
        .locator('[data-association-result-meta]')
        .nth(29)
        .waitFor({ state: 'attached' })
      // Allow ResizeObserver and the map transition to settle before measuring the retained height.
      await page.waitForTimeout(700)
      if ((await separator.getAttribute('aria-valuenow')) !== initialHeight)
        throw new Error(`${name}: results shrank the map`)
      const scroll = page.locator('[data-association-scroll]')
      if (!(await scroll.evaluate(node => node.scrollHeight > node.clientHeight)))
        throw new Error(`${name}: results do not scroll`)
      await scroll.evaluate(node => {
        node.scrollTop = node.scrollHeight
      })
      if (!(await scroll.evaluate(node => node.scrollTop > 0)))
        throw new Error(`${name}: results cannot be scrolled`)
      await scroll.evaluate(node => {
        node.scrollTop = 0
      })
      await page.screenshot({
        path: `output/playwright/association-${name}-map-results.png`,
      })
      console.log(
        JSON.stringify({
          browser: name,
          results: 30,
          retainedMapHeight: initialHeight,
          scrollable: true,
        }),
      )
      continue
    }
    await page.locator('[data-result-id]').click()
    const addressButtonColor = await page
      .getByRole('button', { name: 'Just use address', exact: true })
      .evaluate(element => getComputedStyle(element).color)
    if (addressButtonColor !== 'rgb(255, 255, 255)')
      throw new Error(
        `${name}: address action text is not white in dark mode: ${addressButtonColor}`,
      )
    await page.getByRole('button', { name: 'Locate feature here', exact: true }).click()
    await page
      .locator('[data-association-kind="premises"][data-evidence="location"]')
      .waitFor()
    if (await page.locator('[data-association-status]').count())
      throw new Error(`${name}: metadata visible before address components`)
    await page
      .locator('[data-association-kind="address"][data-evidence="location"]')
      .waitFor()
    if ((await page.getByRole('radio').locator('svg').count()) !== 4)
      throw new Error(`${name}: missing type icons`)
    if (
      await page
        .locator('[data-location-association-picker] [data-association-heading]')
        .count()
    )
      throw new Error(`${name}: heading still takes picker space`)
    const layout = await page
      .getByRole('radio', { name: 'Address', exact: true })
      .evaluate(node => ({
        icon: node.querySelector('svg')!.getBoundingClientRect().bottom,
        description: node.querySelectorAll(':scope > span')[1].getBoundingClientRect()
          .bottom,
        track: node.querySelector('[data-association-track]')!.getBoundingClientRect()
          .top,
        fill: getComputedStyle(node.querySelector('[data-association-notch]')!)
          .backgroundColor,
        panel: getComputedStyle(
          document.querySelector('[data-location-association-picker]')!,
        ).backgroundColor,
      }))
    if (layout.icon >= layout.track || layout.description >= layout.track)
      throw new Error(`${name}: icons are below track`)
    if (
      (await page
        .locator('[data-association-footer]')
        .evaluate(node => getComputedStyle(node).borderTopWidth)) !== '0px'
    )
      throw new Error(`${name}: footer still has a rule`)
    const selectorFrame = await page
      .locator('[data-association-selector]')
      .evaluate(node => {
        const rect = node.getBoundingClientRect(),
          parent = node.closest('[data-association-scroll]')!.getBoundingClientRect()
        return {
          width: rect.width,
          available: parent.width,
          top: rect.top - parent.top,
        }
      })
    if (
      Math.abs(selectorFrame.width - selectorFrame.available) > 2 ||
      Math.abs(selectorFrame.top) > 1
    )
      throw new Error(
        `${name}: selector is not flush and full width: ${JSON.stringify(selectorFrame)}`,
      )
    await page.getByRole('button', { name: 'Location indicators', exact: true }).click()
    await page.locator('[data-association-legend]').waitFor()
    await page.getByRole('button', { name: 'Location indicators', exact: true }).click()
    const order = await page
      .getByRole('radio')
      .evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('data-association-kind')),
      )
    if (order.join(',') !== 'establishment,building,premises,address')
      throw new Error(`${name}: wrong specificity order`)
    await page.screenshot({ path: `output/playwright/association-${name}-track.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
      path: `output/playwright/association-${name}-track-mobile.png`,
      fullPage: true,
    })
    await page.getByRole('radio', { name: 'Establishment', exact: true }).click()
    if (await page.getByRole('button', { name: 'Multilingual', exact: true }).count())
      throw new Error(`${name}: multilingual shown without a selection`)
    await page
      .getByRole('textbox', { name: 'Establishment · Name' })
      .fill('Hollywood Cafe')
    if (
      await page
        .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
        .count()
    )
      throw new Error(`${name}: typed text enabled confirmation`)
    const cafeRow = page.locator('[data-association-result="place:cafe"]')
    const metadata = cafeRow.locator('[data-association-result-meta]')
    if (
      !(await metadata.locator('[data-association-icon]').count()) ||
      !(await metadata.innerText()).includes(' m')
    )
      throw new Error(`${name}: distance and sync state are not grouped`)
    await cafeRow.hover()
    await page.screenshot({
      path: `output/playwright/association-${name}-result-metadata.png`,
    })
    await page.waitForFunction(() =>
      JSON.parse(
        document.querySelector('[data-markers]')!.getAttribute('data-markers')!,
      ).some(
        (marker: { id: string; number: number; highlighted: boolean }) =>
          marker.id === 'place:cafe' && marker.number === 1 && marker.highlighted,
      ),
    )
    if ((await cafeRow.locator('[data-association-number]').textContent()) !== '1')
      throw new Error(`${name}: row/map numbers disagree`)
    await page.locator('[data-fixture-marker="place:cafe"]').click()
    let acceptedMode = 'provisional/reset and map verified'
    // The focused scope can run while the comparison editor is being refined independently.
    if (process.env.ASSOCIATION_SCOPE !== 'provisional') {
      await page.waitForFunction(
        () =>
          document.querySelector('[data-association-selector]')!.getBoundingClientRect()
            .height <= 130,
      )
      const reselect = page.getByRole('button', {
        name: 'Change selection',
        exact: true,
      })
      if (await reselect.innerText())
        throw new Error(`${name}: reselection is not icon-only`)
      await reselect.hover()
      await page.getByRole('tooltip').filter({ hasText: 'Change selection' }).waitFor()
      await page.mouse.move(0, 0)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({
        path: `output/playwright/association-${name}-comparison-mobile.png`,
        fullPage: true,
      })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`${name}: narrow overflow`)
      const streetSwitch = page.getByRole('switch', {
        name: 'Use chosen address for Street name',
      })
      if ((await streetSwitch.getAttribute('aria-checked')) !== 'false')
        throw new Error(`${name}: wrong Location default`)
      await streetSwitch.click()
      await page.getByRole('button', { name: 'Edit Street name', exact: true }).click()
      await page
        .waitForFunction(
          () => {
            const input = document.querySelector('input[aria-label="Your Street name"]')
            return (
              input &&
              document.activeElement === input &&
              input
                .closest('[data-address-choice]')
                ?.getAttribute('data-address-choice') === 'original'
            )
          },
          undefined,
          { timeout: 5000 },
        )
        .catch(async error => {
          console.error(
            await page
              .getByRole('combobox', { name: 'Your Street name' })
              .evaluate(element => ({
                side: element
                  .closest('[data-address-choice]')
                  ?.getAttribute('data-address-choice'),
                active: document.activeElement?.outerHTML,
              })),
          )
          throw error
        })
      await page
        .getByRole('combobox', { name: 'Your Street name' })
        .fill('Correct Road')
      await page.getByRole('option', { name: 'Correct Road', exact: true }).click()
      await page.getByRole('button', { name: 'Edit Details' }).click()
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[data-address-choice="original"]').length === 9,
      )
      const componentOrder = await page
        .locator('[data-address-choice="original"]')
        .evaluateAll(nodes =>
          nodes.map(node => node.getAttribute('data-address-group')),
        )
      if (
        componentOrder.join(',') !==
        'street,number,premises,phase,building,block,floor,unit,access'
      )
        throw new Error(
          `${name}: details are not general to specific: ${componentOrder.join(',')}`,
        )
      const originalCell = await page
        .locator('[data-address-choice="original"]')
        .first()
        .boundingBox()
      const locationCell = await page
        .locator('[data-address-choice="location"]')
        .first()
        .boundingBox()
      if (!originalCell || !locationCell || originalCell.x >= locationCell.x)
        throw new Error(`${name}: comparison sides are reversed`)
      if (
        (await page
          .getByRole('button', { name: /Chosen position$/ })
          .getAttribute('aria-pressed')) !== 'true'
      )
        throw new Error(`${name}: original marker is not the default`)
      await page
        .getByRole('switch', { name: 'Use chosen address for Map pin', exact: true })
        .click()
      if (
        (await page
          .getByRole('button', { name: /Match position$/ })
          .getAttribute('aria-pressed')) !== 'true'
      )
        throw new Error(`${name}: marker switch did not select the Location`)
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="separator"][aria-label="Resize map"]')!
            .getAttribute('aria-valuenow') === '128',
      )
      const mapFrame = await page.locator('[data-fixture-map]').evaluate(node => ({
        height: node.closest('section')!.getBoundingClientRect().height,
        child: node.getBoundingClientRect().height,
      }))
      if (mapFrame.height < 128 || mapFrame.height > 132 || mapFrame.child < 128)
        throw new Error(`${name}: wrong map minimum ${mapFrame.height}`)
      const footerBefore = await page.locator('[data-association-footer]').boundingBox()
      const scroll = page.locator('[data-association-scroll]')
      const scrolls = await scroll.evaluate(element => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop > 0
      })
      if (!scrolls) throw new Error(`${name}: picker cannot scroll`)
      const footerAfter = await page.locator('[data-association-footer]').boundingBox()
      if (
        !footerAfter ||
        !footerBefore ||
        Math.abs(footerBefore.y - footerAfter.y) > 1 ||
        footerAfter.y + footerAfter.height > 845
      )
        throw new Error(`${name}: footer is not fixed inside viewport`)
      await page.screenshot({
        path: `output/playwright/association-${name}-edited-mobile.png`,
      })
      await page.setViewportSize({ width: 1000, height: 1200 })
      await page.locator('[data-association-comparison]').scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `output/playwright/association-${name}-comparison-desktop.png`,
      })
      await page.setViewportSize({ width: 320, height: 844 })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`${name}: 320px overflow`)
      await page.screenshot({
        path: `output/playwright/association-${name}-marker-320.png`,
      })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('separator', { name: 'Resize map' }).press('ArrowDown')
      await page.waitForTimeout(250)
      if (
        (await page
          .getByRole('separator', { name: 'Resize map' })
          .getAttribute('aria-valuenow')) !== '168'
      )
        throw new Error(
          `${name}: automatic fitting overrode manual map expansion: ${await page.getByRole('separator', { name: 'Resize map' }).getAttribute('aria-valuenow')}`,
        )
      await page.getByRole('separator', { name: 'Resize map' }).press('Home')
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      for (const group of ['number', 'floor', 'unit']) {
        if (
          (await page
            .locator(`[data-address-group="${group}"] [data-field-locale]`)
            .count()) !== 2
        )
          throw new Error(`${name}: shared ${group} offers translations`)
      }
      await page
        .getByRole('button', { name: 'Edit Establishment name', exact: true })
        .click()
      await page
        .getByRole('textbox', { name: 'Establishment name', exact: true })
        .fill('Reviewed Cafe')
      await page
        .getByRole('button', { name: 'Establishment name · zh-hant', exact: true })
        .click()
      await page
        .getByRole('textbox', { name: 'Establishment name · zh-hant', exact: true })
        .fill('已核對咖啡店')
      await page.getByRole('button', { name: 'Edit Building', exact: true }).click()
      await page
        .getByRole('combobox', { name: 'Your Building', exact: true })
        .fill('Custom Tower')
      await page
        .getByRole('button', { name: 'Establishment name', exact: true })
        .click()
      await page.getByRole('button', { name: 'Your Building', exact: true }).waitFor()
      if (
        await page.getByRole('combobox', { name: 'Your Building', exact: true }).count()
      )
        throw new Error(`${name}: blurred field is still an input`)
      await page.getByRole('button', { name: 'Your Building', exact: true }).click()
      await page.getByRole('combobox', { name: 'Your Building', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Reset Building', exact: true }).click()
      await page.getByRole('button', { name: 'Edit Building', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Edit Level', exact: true }).click()
      await page.getByRole('combobox', { name: 'Floor type', exact: true }).click()
      await page.getByRole('option', { name: 'Basement', exact: true }).click()
      await page.getByRole('textbox', { name: 'Your Level', exact: true }).fill('2')
      await page.setViewportSize({ width: 320, height: 844 })
      const unitBounds = await page
        .getByRole('textbox', { name: 'Your Level', exact: true })
        .evaluate(node => {
          const field = node.closest('[data-address-choice]')!.getBoundingClientRect(),
            input = node.getBoundingClientRect()
          return input.left >= field.left && input.right <= field.right
        })
      if (!unitBounds)
        throw new Error(`${name}: structured input overflows the comparison cell`)
      await page.screenshot({
        path: `output/playwright/association-${name}-structured-320.png`,
      })
      await page.getByRole('button', { name: 'Edit Flat / Unit', exact: true }).click()
      await page.getByRole('combobox', { name: 'Unit type', exact: true }).click()
      await page.getByRole('option', { name: 'Room', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'Your Flat / Unit', exact: true })
        .fill('45')
      await page
        .getByRole('button', { name: 'Establishment name', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Your Flat / Unit', exact: true })
        .waitFor()
      await page
        .getByRole('textbox', { name: 'Establishment name', exact: true })
        .press('Enter')
      await page.setViewportSize({ width: 390, height: 844 })
      await page.locator('[data-association-name]').scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `output/playwright/association-${name}-multilingual.png`,
      })
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      await page
        .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
        .click()
      if ((await page.locator('[data-fixture-map]').boundingBox())!.height > 130)
        throw new Error(`${name}: map grew back automatically`)
      await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
      await page.locator('[data-saved]').waitFor()
      const selected = JSON.parse(
        (await page.locator('[data-selected]').getAttribute('data-selected'))!,
      )
      acceptedMode = selected.address.association.mode
      if (
        selected.names.en !== 'Reviewed Cafe' ||
        selected.names['zh-hant'] !== '已核對咖啡店'
      )
        throw new Error(`${name}: multilingual names were not accepted`)
      if (
        selected.address.association.mode !== 'linked' ||
        selected.source.ssId !== 'cafe'
      )
        throw new Error(`${name}: wrong association`)
      if (
        JSON.stringify(selected.address.coordinates) !==
        JSON.stringify([114.1501, 22.3])
      )
        throw new Error(`${name}: explicit marker choice was not accepted`)
      if (
        selected.address.overrides.en.streetName !== 'Correct Road' ||
        selected.address.association.choices.street !== 'custom' ||
        selected.address.association.content.i18n.en.buildingNumberFrom !== '118'
      )
        throw new Error(`${name}: component choices lost`)
      await page.screenshot({
        path: `output/playwright/association-${name}-accepted-mobile.png`,
        fullPage: true,
      })
      if (
        await page
          .locator('[data-association-icon]')
          .evaluateAll(nodes =>
            nodes.some(node => node.getAttribute('data-association-icon') !== 'linked'),
          )
      )
        throw new Error(`${name}: inconsistent matched icons`)
      await page
        .getByRole('button', { name: 'Synced - toggle to unsync', exact: true })
        .click()
      if (
        await page
          .locator('[data-association-icon]')
          .evaluateAll(nodes =>
            nodes.some(node => node.getAttribute('data-association-icon') !== 'manual'),
          )
      )
        throw new Error(`${name}: detached icons disagree`)
      await page
        .getByRole('button', { name: 'Not Synced - toggle to sync', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Synced - toggle to unsync', exact: true })
        .waitFor()
      if (
        await page
          .locator('[data-association-icon]')
          .evaluateAll(nodes =>
            nodes.some(node => node.getAttribute('data-association-icon') !== 'linked'),
          )
      )
        throw new Error(`${name}: restored icons disagree`)
      await page.getByRole('separator', { name: 'Resize map' }).press('ArrowDown')
      if (
        (await page
          .getByRole('separator', { name: 'Resize map' })
          .getAttribute('aria-valuenow')) !== '168'
      )
        throw new Error(`${name}: map cannot be restored manually`)
      await page.getByRole('button', { name: 'Change location association' }).hover()
      await page
        .getByRole('tooltip')
        .filter({ hasText: 'Change location association' })
        .waitFor()
    }
    // Exercise the other two statuses through the same acceptance flow.
    for (const mode of ['manual', 'unlinked']) {
      await page.goto(`${baseUrl}/__location-association.html`, {
        waitUntil: 'domcontentloaded',
      })
      await page.locator('[data-result-id]').click()
      await page
        .getByRole('button', { name: 'Locate feature here', exact: true })
        .click()
      if (mode === 'unlinked') {
        await page.getByRole('radio', { name: 'Establishment', exact: true }).click()
        await page
          .getByRole('textbox', { name: 'Establishment · Name' })
          .fill('Quiet Courtyard')
        if (
          await page
            .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
            .count()
        )
          throw new Error(`${name}: unselected custom name enabled confirmation`)
        await page
          .getByRole('button', { name: 'Use this establishment', exact: true })
          .click()
      }
      if (mode !== 'unlinked')
        await page
          .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
          .click()
      await page
        .locator('[data-location-association-picker]')
        .waitFor({ state: 'detached' })
      await page.waitForFunction(
        () => document.querySelectorAll('[data-association-icon]').length >= 2,
      )
      const icons = await page
        .locator('[data-association-icon]')
        .evaluateAll(nodes =>
          nodes.map(node => node.getAttribute('data-association-icon')),
        )
      if (icons.length < 2 || icons.some(value => value !== mode))
        throw new Error(`${name}: inconsistent ${mode} icons`)
      const enabledState = 'Open to Sync'
      if (mode === 'unlinked')
        await page
          .getByRole('button', { name: 'Open to Sync - toggle to unsync', exact: true })
          .click()
      const toggleOn = page.getByRole('button', {
        name: 'Not Synced - toggle to sync',
        exact: true,
      })
      await toggleOn.hover()
      await page
        .getByRole('tooltip')
        .filter({ hasText: 'Not Synced - toggle to sync' })
        .waitFor()
      const brokenPath = await toggleOn.locator('svg').innerHTML()
      await toggleOn.click()
      const toggleOff = page.getByRole('button', {
        name: `${enabledState} - toggle to unsync`,
        exact: true,
      })
      if (
        (await toggleOff
          .locator('[data-association-icon]')
          .getAttribute('data-association-icon')) !== 'unlinked'
      )
        throw new Error(`${name}: local record was incorrectly shown as synced`)
      if ((await toggleOff.locator('svg').innerHTML()) === brokenPath)
        throw new Error(`${name}: open and not-synced icons are identical`)
      const colors = await toggleOff
        .locator('[data-association-icon]')
        .evaluate(node => ({
          icon: getComputedStyle(node).color,
          primary: getComputedStyle(
            document.querySelector('[aria-label="Change location association"]')!,
          ).color,
        }))
      if (colors.icon === colors.primary)
        throw new Error(`${name}: open to sync icon uses primary colour`)
      if (mode === 'manual') await toggleOff.click()
      await page.screenshot({
        path: `output/playwright/association-${name}-${mode}-mobile.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Change location association' }).click()
      await page.locator('[data-location-association-picker]').waitFor()
      if (mode === 'unlinked') {
        const ownRow = page.locator('[data-association-ghost]')
        if (!(await ownRow.innerText()).includes('Quiet Courtyard'))
          throw new Error(`${name}: custom record not preselected`)
        await page
          .getByRole('textbox', { name: 'Establishment · Name' })
          .fill('Hollywood Cafe')
        await page.getByRole('button', { name: 'Reset search', exact: true }).click()
        if (
          (await page
            .getByRole('textbox', { name: 'Establishment · Name' })
            .inputValue()) !== 'Quiet Courtyard' ||
          !(await ownRow.innerText()).includes('Quiet Courtyard')
        )
          throw new Error(
            `${name}: reset renamed or failed to select provisional record`,
          )
        await page.screenshot({
          path: `output/playwright/association-${name}-provisional-mobile.png`,
        })
        await page
          .getByRole('textbox', { name: 'Establishment · Name' })
          .fill('Hollywood Cafe')
        await page.getByRole('button', { name: /Hollywood Cafe.*Queen Road/ }).click()
        await page
          .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
          .click()
        const synced = page.getByRole('button', {
          name: 'Synced - toggle to unsync',
          exact: true,
        })
        const colors = await synced
          .locator('[data-association-icon]')
          .evaluate(node => ({
            icon: getComputedStyle(node).color,
            primary: getComputedStyle(
              document.querySelector('[aria-label="Change location association"]')!,
            ).color,
          }))
        if (
          colors.icon !== colors.primary ||
          (await synced.locator('svg').count()) !== 1
        )
          throw new Error(`${name}: synced chain is not a single primary icon`)
        await synced.click()
        await page
          .getByRole('button', { name: 'Not Synced - toggle to sync', exact: true })
          .click()
        await synced.waitFor()
        await page.screenshot({
          path: `output/playwright/association-${name}-sync-toggle.png`,
        })
      }
    }
    // Reconcile a full building identity into premises/block components without repeating the identity as a Building field.
    await page.goto(`${baseUrl}/__location-association.html`, {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('[data-result-id]').click()
    await page.getByRole('button', { name: 'Locate feature here', exact: true }).click()
    await page.getByRole('radio', { name: 'Building', exact: true }).click()
    await page.getByRole('textbox', { name: 'Building · Name' }).fill('Hollywood')
    await page
      .getByRole('button', { name: /Hollywood Terrace Tower B.*Queen Road/ })
      .click()
    await page.getByText('Tower B', { exact: true }).waitFor()
    await page.screenshot({
      path: `output/playwright/association-${name}-building-mobile.png`,
    })
    await page
      .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
      .click()
    const parsedBuilding = JSON.parse(
      (await page.locator('[data-selected]').getAttribute('data-selected'))!,
    )
    const fields = parsedBuilding.address.association.content.i18n.en
    if (
      fields.buildingName ||
      fields.premisesName !== 'Hollywood Terrace' ||
      fields.blockType !== 'tower' ||
      fields.blockRef !== 'B' ||
      parsedBuilding.names.en !== 'Hollywood Terrace Tower B'
    )
      throw new Error(
        `${name}: building components were not parsed or identity was lost`,
      )
    await page.getByRole('button', { name: 'Change location association' }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.locator('[data-result-id]').waitFor()
    if (await page.locator('[data-location-association-picker]').count())
      throw new Error(`${name}: cancel did not return to discovery results`)
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="separator"][aria-label="Resize map"]')!
          .getAttribute('aria-valuenow') === String(Math.round(innerHeight * 0.35)),
    )
    await page.locator('[data-result-id]').click()
    await page.getByRole('button', { name: 'Locate feature here', exact: true }).click()
    await page.getByRole('radio', { name: 'Complex', exact: true }).click()
    await page.getByRole('textbox', { name: 'Complex · Name' }).fill('Mall')
    await page.locator('[data-association-empty]').waitFor()
    await page.screenshot({
      path: `output/playwright/association-${name}-no-results-mobile.png`,
    })
    await page.getByRole('button', { name: 'Use this complex', exact: true }).click()
    await page.waitForFunction(
      () =>
        document.querySelector('[data-selected]')?.getAttribute('data-selected') !==
        'null',
    )
    const customPremises = JSON.parse(
      (await page.locator('[data-selected]').getAttribute('data-selected'))!,
    )
    if (
      customPremises.kind !== 'premises' ||
      customPremises.address.association.mode !== 'unlinked'
    )
      throw new Error(`${name}: explicit no-result creation failed`)
    // Direct address acceptance also snapshots/restores height even when the picker was never opened.
    await page.goto(`${baseUrl}/__location-association.html`, {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('[data-result-id]').click()
    await page.getByRole('button', { name: 'Just use address', exact: true }).click()
    await page.getByRole('separator', { name: 'Resize map' }).press('Home')
    await page.getByRole('button', { name: 'Back to results', exact: true }).click()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="separator"][aria-label="Resize map"]')!
          .getAttribute('aria-valuenow') === String(Math.round(innerHeight * 0.35)),
    )
    if (name === 'chromium') {
      await page.setViewportSize({ width: 1000, height: 1000 })
      await page.goto(`${baseUrl}/__location-association.html?map=1&group=1`, {
        waitUntil: 'domcontentloaded',
      })
      await page.locator('[data-result-id]').click()
      await page.waitForFunction(
        () => document.querySelectorAll('[data-location-candidate]').length === 3,
        undefined,
        { timeout: 30000 },
      )
      const rows = page.locator('[data-result-id]')
      await rows.nth(0).focus()
      await rows.nth(1).hover()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-location-candidate="address:group-1"]')
            ?.getAttribute('data-highlighted') === 'true',
      )
      await page.waitForTimeout(700)
      const positions = await page.locator('[data-fixture-real-map]').evaluate(node => {
        const map = node.getBoundingClientRect()
        return [...node.querySelectorAll('[data-location-candidate]')].map(marker => {
          const rect = marker.getBoundingClientRect()
          return {
            x: (rect.x + rect.width / 2 - map.x) / map.width,
            y: (rect.y + rect.height / 2 - map.y) / map.height,
          }
        })
      })
      if (
        positions.some(
          point => point.x < 0.19 || point.x > 0.81 || point.y < 0.19 || point.y > 0.81,
        )
      )
        throw new Error(
          `${name}: subset markers exceed 20% padding: ${JSON.stringify(positions)}`,
        )
      // The maximum zoom can stop slightly short of the padded edge; the subset must still occupy the map.
      if (
        !positions.some(
          point => Math.abs(point.x - 0.5) > 0.24 || Math.abs(point.y - 0.5) > 0.24,
        )
      )
        throw new Error(
          `${name}: subset was not fitted to its own bounds: ${JSON.stringify(positions)}`,
        )
      await page.screenshot({
        path: `output/playwright/association-${name}-subset-map.png`,
      })
    }
    if (name === 'chromium' && process.env.ASSOCIATION_SCOPE !== 'provisional') {
      await page.goto(`${baseUrl}/__location-association.html?map=1`, {
        waitUntil: 'domcontentloaded',
      })
      await page.locator('[data-result-id]').click()
      await page
        .getByRole('button', { name: 'Locate feature here', exact: true })
        .click()
      await page.getByRole('radio', { name: 'Establishment', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'Establishment · Name' })
        .fill('Hollywood Cafe')
      await page.getByRole('button', { name: /Hollywood Cafe.*Queen Road/ }).click()
      await page.getByRole('button', { name: 'Edit Details' }).click()
      await page.getByRole('separator', { name: 'Resize map' }).press('Home')
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="separator"][aria-label="Resize map"]')
            ?.getAttribute('aria-valuenow') === '128',
      )
      await page.getByRole('button', { name: /Chosen position$/ }).hover()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-location-candidate="address:hollywood"]')
            ?.getAttribute('data-highlighted') === 'true',
      )
      await page.getByRole('button', { name: /Match position$/ }).hover()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-location-candidate="place:cafe"]')
            ?.getAttribute('data-highlighted') === 'true',
      )
      await page.waitForTimeout(500)
      const geometry = await page.locator('[data-fixture-real-map]').evaluate(node => {
        const map = node.getBoundingClientRect()
        return {
          height: map.height,
          markers: [...node.querySelectorAll('[data-location-candidate]')].map(
            marker => {
              const rect = marker.getBoundingClientRect()
              return {
                left: (rect.left - map.left) / map.width,
                right: (map.right - rect.right) / map.width,
                top: (rect.top - map.top) / map.height,
                bottom: (map.bottom - rect.bottom) / map.height,
              }
            },
          ),
        }
      })
      if (
        geometry.height < 128 ||
        geometry.markers.length !== 2 ||
        geometry.markers.some(marker =>
          Object.values(marker).some(margin => margin < 0.195),
        )
      )
        throw new Error(
          `${name}: comparison map does not retain 128px and 20% margins: ${JSON.stringify(geometry)}`,
        )
      const compactHeight = await page
        .locator('[data-association-marker-choice]')
        .evaluate(node => node.getBoundingClientRect().height)
      if (compactHeight > 120)
        throw new Error(`${name}: marker comparison is not compact: ${compactHeight}`)
      await page.screenshot({
        path: `output/playwright/association-${name}-comparison-map.png`,
      })
    }
    await page.goto(`${baseUrl}/__location-association.html?direct=1`, {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('[data-result-id]').click()
    await page.getByRole('button', { name: 'Locate feature here', exact: true }).click()
    await page.locator('[data-association-name]').waitFor()
    if (
      (await page
        .getByText('Both records have the same address details.', { exact: true })
        .count()) ||
      (await page.getByRole('button', { name: 'Multilingual', exact: true }).count())
    )
      throw new Error(
        `${name}: direct selection still shows comparison/editing controls`,
      )
    await page.getByRole('button', { name: 'Edit Details', exact: true }).click()
    await page.locator('[data-association-details]').waitFor()
    if (
      (await page.getByRole('switch').count()) ||
      (await page.getByText('Chosen address', { exact: true }).count()) ||
      (await page.locator('[data-address-group="number"]').count()) !== 1
    )
      throw new Error(`${name}: direct editing duplicates address sources`)
    await page.getByRole('button', { name: 'Multilingual', exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error(`${name}: direct editing overflows on mobile`)
    await page.screenshot({
      path: `output/playwright/association-${name}-single-location-mobile.png`,
    })
    await page.getByRole('button', { name: 'Edit Street number', exact: true }).click()
    await page
      .getByRole('textbox', { name: 'Your Street number', exact: true })
      .fill('88')
    await page
      .getByRole('button', { name: /^Use (?:Recommended Location|Location)$/ })
      .click()
    const edited = JSON.parse(
      (await page.locator('[data-selected]').getAttribute('data-selected'))!,
    )
    if (
      edited.buildingSource.id !== 'heights' ||
      edited.address.overrides.en.buildingNumberExpression !== '88'
    )
      throw new Error(`${name}: direct edit lost identity or address correction`)
    console.log(
      JSON.stringify({
        browser: name,
        association: acceptedMode,
        narrowOverflow: false,
        schemaValidated: process.env.ASSOCIATION_SCOPE !== 'provisional',
        statusIcons: 'all three consistent',
        selector: 'full width and flush',
      }),
    )
  } catch (error) {
    await page
      .screenshot({ path: `output/playwright/association-${name}-failure.png` })
      .catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
if (failures.length) throw new Error(failures.join('\n'))
