// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const baseUrl = process.env.CHANGELOG_CHECK_URL ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/resource-changelog'
await mkdir(directory, { recursive: true })
const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__changelog.html*', route =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
      await page.goto(`${baseUrl}/__changelog.html`)
      const first = page.locator('details[data-change-key="first-0"]')
      const viewport = page.locator('svelte-virtual-list-viewport')
      await first.waitFor()
      const summary = first.locator('summary')
      const padding = await summary.evaluate(element => {
        const style = getComputedStyle(element)
        return [style.paddingLeft, style.paddingRight]
      })
      if (padding.some(value => value !== '16px'))
        throw new Error('Rows do not have 16px horizontal padding')
      const actor = first.getByRole('link', { name: '@Example.Editor', exact: true })
      if ((await actor.getAttribute('href')) !== '/admin/users/example.editor')
        throw new Error('Actor username route is incorrect')
      await actor.evaluate(element =>
        element.addEventListener('click', event => event.preventDefault(), {
          once: true,
        }),
      )
      await actor.click()
      if (await first.evaluate(element => (element as HTMLDetailsElement).open))
        throw new Error('Actor link toggled the disclosure')
      const age = await summary.locator('time').innerText()
      if (
        !/ago|yesterday|last|now/.test(age) ||
        !(await summary.locator('time').getAttribute('title'))
      )
        throw new Error('Relative age or exact timestamp is missing')
      const system = page
        .locator('details[data-change-key="first-1"]')
        .locator('summary')
      if (
        (await system.getByRole('link').count()) ||
        !(await system.getByText('System', { exact: true }).count())
      )
        throw new Error('System actor is not presented as a non-user reference')
      const legacy = page.locator('details[data-change-key="first-2"]')
      const legacyLink = legacy.getByRole('link', {
        name: '@Original.User',
        exact: true,
      })
      if (
        (await legacyLink.getAttribute('href')) !== '/admin/users/original.user' ||
        !(await legacy.getByText('(Reviewer)', { exact: true }).count())
      )
        throw new Error('Legacy Feature reviewer attribution is missing')
      const direct = page.locator('details[data-change-key="first-5"]')
      if (!(await direct.getByText('(Contributor)', { exact: true }).count()))
        throw new Error('Direct Feature contributor attribution is missing')
      if (await page.locator('details[open]').count())
        throw new Error('Rows are not initially collapsed')
      if (await page.getByRole('navigation', { name: 'Changelog pages' }).count())
        throw new Error('Paging controls remain')
      if (
        (await page
          .locator('.bits-form__section-header .bits-form__section-header-heading')
          .count()) !== 1
      )
        throw new Error('Standard section header is missing')
      const bounds = await first.boundingBox(),
        listBounds = await viewport.boundingBox()
      if (
        !bounds ||
        !listBounds ||
        Math.abs(bounds.x - listBounds.x) > 1 ||
        Math.abs(bounds.width - listBounds.width) > 1
      )
        throw new Error('Rows are not full width')
      const scrollbar = await page.locator('[data-svrollbar]').boundingBox()
      if (scrollbar && scrollbar.y < listBounds.y - 1)
        throw new Error('The list scrollbar overlaps the section header')
      await first.locator('summary').focus()
      await page.keyboard.press('Enter')
      await first.locator('text=Changed name').waitFor({ state: 'visible' })
      await page.screenshot({
        path: `${directory}/${name}-${width}-expanded.png`,
        fullPage: true,
      })
      // Variable row measurement can change scrollHeight after a jump; keep scrolling as a user would.
      for (
        let attempt = 0;
        attempt < 80 &&
        !(await page.locator('details[data-change-key="first-299"]').count());
        attempt++
      ) {
        await viewport.evaluate(element => {
          element.scrollTop = element.scrollHeight
        })
        await page.waitForTimeout(120)
      }
      if (!(await page.locator('details[data-change-key="first-299"]').count())) {
        console.log(
          JSON.stringify({
            browser: name,
            width,
            debug: await viewport.evaluate(element => ({
              top: element.scrollTop,
              height: element.clientHeight,
              total: element.scrollHeight,
              rows: [...element.querySelectorAll('details[data-change-key]')].map(row =>
                row.getAttribute('data-change-key'),
              ),
            })),
            requests: await page
              .locator('[data-requests]')
              .getAttribute('data-requests'),
          }),
        )
        await page.screenshot({ path: `${directory}/${name}-${width}-failure.png` })
      }
      await page.locator('details[data-change-key="first-299"]').waitFor()
      const requests = await page
        .locator('[data-requests]')
        .evaluate(
          element => JSON.parse(element.getAttribute('data-requests')!) as string[],
        )
      if (requests.length !== 12 || new Set(requests).size !== requests.length)
        throw new Error(`Unexpected continuation requests: ${JSON.stringify(requests)}`)
      const mounted = await page.locator('details[data-change-key]').count()
      if (mounted >= 80) throw new Error(`Virtualization mounted ${mounted} rows`)
      await viewport.evaluate(element => {
        element.scrollTop = 0
      })
      await first.waitFor()
      if (!(await first.evaluate(element => (element as HTMLDetailsElement).open)))
        throw new Error('Virtualization lost disclosure state')
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await first.waitFor()
      if (await page.locator('details[open]').count())
        throw new Error('Refresh retained expansion')
      await page.getByRole('button', { name: 'Switch locale', exact: true }).click()
      await page
        .getByText(/皇后大道中/)
        .first()
        .waitFor()
      await page.getByRole('button', { name: 'Switch scope', exact: true }).click()
      await page.locator('details[data-change-key="second-0"]').waitFor()
      if (await page.locator('details[data-change-key^="first-"]').count())
        throw new Error('Old scope retained')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      if (overflow) throw new Error(`${name} ${width} has horizontal overflow`)
      await page.screenshot({
        path: `${directory}/${name}-${width}-collapsed.png`,
        fullPage: true,
      })
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(
        JSON.stringify({
          browser: name,
          width,
          fullWidth: true,
          standardHeader: true,
          keyboardExpansion: true,
          infiniteScroll: true,
          entries: 300,
          mounted,
          retainedDisclosure: true,
          locale: true,
          scope: true,
          actorLink: true,
          relativeDates: true,
          padding: '16px',
          overflow,
          pageErrors: errors.length,
        }),
      )
      await page.close()
    }
    const timeline = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
    await timeline.route('**/__changelog.html*', route =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    await timeline.goto(`${baseUrl}/__changelog.html?boundaries=1`)
    await timeline.locator('details[data-change-key="first-11"]').waitFor()
    const headings = timeline.locator('[data-changelog-boundary]')
    const labels = await headings.allTextContents()
    if (
      JSON.stringify(labels.map(text => text.trim())) !==
      JSON.stringify(['a day ago', 'a week ago', 'a month ago', 'a year ago'])
    )
      throw new Error('Time boundaries are missing, duplicated, or unordered')
    for (const [key, unit] of [
      ['first-3', 'day'],
      ['first-5', 'week'],
      ['first-7', 'month'],
      ['first-9', 'year'],
    ]) {
      const preceding = await timeline
        .locator(`details[data-change-key="${key}"]`)
        .evaluate(element =>
          element.previousElementSibling?.getAttribute('data-changelog-boundary'),
        )
      if (preceding !== unit)
        throw new Error(`Boundary ${unit} is not before its first older entry`)
    }
    const requested = await timeline
      .locator('[data-requests]')
      .evaluate(element => JSON.parse(element.getAttribute('data-requests')!))
    if (requested.length !== 3)
      throw new Error('Boundary preview did not cross page boundaries')
    await timeline.screenshot({
      path: `${directory}/${name}-time-boundaries.png`,
      fullPage: true,
    })
    await timeline.getByRole('button', { name: 'Switch locale', exact: true }).click()
    await timeline.waitForFunction(
      () =>
        document.querySelectorAll('[data-changelog-boundary]').length === 4 &&
        [...document.querySelectorAll('[data-changelog-boundary]')].every(element =>
          element.textContent?.includes('前'),
        ),
    )
    console.log(
      JSON.stringify({
        browser: name,
        timeBoundaries: true,
        continuationDeduplication: true,
        localizedBoundaries: true,
      }),
    )
    await timeline.close()
    for (const mode of ['middle', 'before-all', 'after-all']) {
      const checked = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
      await checked.route('**/__changelog.html*', route =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
      await checked.goto(`${baseUrl}/__changelog.html?boundaries=1&checked=${mode}`)
      await checked.locator('details[data-change-key="first-11"]').waitFor()
      const marker = checked.locator('[data-last-checked]')
      if ((await marker.count()) !== 1)
        throw new Error(`Expected one checked marker for ${mode}`)
      const position = await marker.evaluate(element => ({
        previous: element.previousElementSibling?.getAttribute('data-change-key'),
        next: element.nextElementSibling?.getAttribute('data-change-key'),
        color: getComputedStyle(element).borderTopColor,
      }))
      if (mode === 'middle' && position.next !== 'first-4')
        throw new Error('Checked marker does not separate new and older entries')
      if (mode === 'before-all' && position.next !== 'first-0')
        throw new Error('Checked marker is missing above an entirely old feed')
      if (mode === 'after-all' && position.previous !== 'first-11')
        throw new Error('Checked marker is missing after an entirely new feed')
      const cutoff = await marker.locator('time').getAttribute('datetime')
      await checked.getByRole('button', { name: 'Refresh', exact: true }).click()
      await checked.locator('details[data-change-key="first-11"]').waitFor()
      if (
        (await marker.count()) !== 1 ||
        (await marker.locator('time').getAttribute('datetime')) !== cutoff
      )
        throw new Error('Refresh moved or duplicated the checked marker')
      if (mode === 'middle')
        await checked.screenshot({
          path: `${directory}/${name}-last-checked.png`,
          fullPage: true,
        })
      console.log(
        JSON.stringify({
          browser: name,
          checkedMarker: mode,
          singleMarker: true,
          refreshRetainsCutoff: true,
          blueBorder: position.color,
        }),
      )
      await checked.close()
    }
    // Empty authorized pages must advance; a failed continuation must retain rows and retry once.
    for (const mode of ['sparse', 'failure']) {
      const page = await browser.newPage({ viewport: { width: 900, height: 500 } })
      await page.route('**/__changelog.html*', route =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
      await page.goto(`${baseUrl}/__changelog.html?${mode}=1`)
      const viewport = page.locator('svelte-virtual-list-viewport')
      if (mode === 'sparse')
        await page.locator('details[data-change-key="first-25"]').waitFor()
      else {
        await page.locator('details[data-change-key="first-0"]').waitFor()
        await viewport.evaluate(element => {
          element.scrollTop = element.scrollHeight
        })
        await page.getByRole('alert').waitFor()
        if (!(await page.locator('details[data-change-key]').count()))
          throw new Error('Continuation failure discarded loaded rows')
        await page.getByRole('button', { name: 'Retry', exact: true }).click()
        await page.getByRole('alert').waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector('[data-requests]')!.getAttribute('data-requests')!,
            ).filter((key: string) => key === 'first:25').length === 2,
        )
      }
      console.log(JSON.stringify({ browser: name, mode, passed: true }))
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
