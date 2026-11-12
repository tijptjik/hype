// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const transpiler = new Bun.Transpiler({ loader: 'ts' })
const sources = await Promise.all(
  [
    'src/lib/bits/patterns/forms/featureLocation/fitSearchParts.ts',
    'src/lib/bits/patterns/forms/formFeatureAddress/adaptivePlaceholder.ts',
  ].map(async path =>
    transpiler
      .transformSync(await Bun.file(path).text())
      .replace('export function', 'function'),
  ),
)
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent(`<style>
      #strip{display:flex;gap:24px;width:180px;font:16px sans-serif;overflow:hidden}
      #strip>span{flex-shrink:0;white-space:nowrap}
      #identity{overflow:hidden} .bits-scrollable-text__content{display:inline-block}
      input{box-sizing:border-box;width:100%;padding:4px;font:16px sans-serif}
      #field{width:50px}
      </style><div id="strip"><span id="identity"><span class="bits-scrollable-text__content">A long establishment name</span></span><span data-omission-priority="7">Street details</span><span data-omission-priority="20">Town</span></div><div id="field"><input id="address-en-number"></div>`)
    await page.addScriptTag({
      content:
        sources.join('\n') +
        ';globalThis.fitCleanup=fitSearchParts(document.querySelector("#strip"));globalThis.placeholderCleanup=adaptivePlaceholder(document.querySelector("#field"),"25, 25A, 25–27")',
    })
    await page.waitForFunction(
      () => document.querySelector<HTMLInputElement>('input')?.placeholder === '25',
    )
    assert.equal(
      await page
        .locator('[data-omission-priority="20"]')
        .evaluate(node => (node as HTMLElement).style.display),
      'none',
    )
    const identityWidth = await page
      .locator('#identity')
      .evaluate(node => node.getBoundingClientRect().width)
    assert.ok(identityWidth > 0 && identityWidth <= 180)
    await page.evaluate(() => {
      document.getElementById('strip')?.style.setProperty('width', '800px')
      document.getElementById('field')?.style.setProperty('width', '400px')
    })
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('input')?.placeholder ===
          '25, 25A, 25–27' &&
        document.querySelector<HTMLElement>('[data-omission-priority="20"]')?.style
          .display === '',
    )
    // Replacing the field must observe the new input and release the detached one.
    await page.evaluate(() => {
      const replacement = document.createElement('input')
      replacement.id = 'address-en-number'
      replacement.style.width = '50px'
      document.getElementById('field')?.replaceChildren(replacement)
    })
    await page.waitForFunction(
      () => document.querySelector<HTMLInputElement>('input')?.placeholder === '25',
    )
    await page.locator('input').evaluate(node => (node.style.width = '400px'))
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('input')?.placeholder ===
        '25, 25A, 25–27',
    )
    assert.deepEqual(errors, [])
    console.log(
      `${name}: narrow identity, restored address parts, placeholder fitting and replaced input resizing passed`,
    )
  } finally {
    await browser.close()
  }
}
