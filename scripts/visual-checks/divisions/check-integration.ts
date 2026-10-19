import { chromium } from 'playwright'
const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome'})
try {
 const page = await browser.newPage({viewport:{width:1100,height:1200},deviceScaleFactor:2})
 const errors: string[] = []
 page.on('pageerror', e => errors.push(e.message))
 await page.goto('http://127.0.0.1:4173/robots.txt')
 await page.setContent('<html><head></head><body><div id="fixture"></div></body></html>')
 await page.addScriptTag({type:'module',url:'http://127.0.0.1:4173/src/tests/fixtures/division-icons-review.ts'})
 await page.waitForSelector('button svg', {timeout:30000})
 await page.waitForTimeout(500)
 const icons = await page.locator('button svg').evaluateAll(nodes => nodes.map(n => ({viewBox:n.getAttribute('viewBox'),stroke:n.getAttribute('stroke'),width:n.getAttribute('stroke-width'),content:n.innerHTML})))
 if (icons.length !== 26) throw new Error(`Expected 26 icons, got ${icons.length}`)
 if (icons.some(n => n.viewBox !== '0 0 24 24' || n.width !== '1.5' || n.stroke !== 'currentColor')) throw new Error('SVG contract mismatch')
 if (new Set(icons.slice(0,13).map(n=>n.content)).size !== 13) throw new Error('Class icons are not distinct')
 const colours = await page.locator('section').evaluateAll(nodes => nodes.map(n => getComputedStyle(n.querySelector('svg')!).color))
 if (colours[0] === colours[1]) throw new Error('Theme colours did not change')
 if (errors.length) throw new Error(errors.join('\n'))
 await page.screenshot({path:'output/playwright/divisions/integration.png',fullPage:true})
 console.log('PASS: 13 distinct class icons rendered through the real division row in two themes; no browser errors.')
} finally { await browser.close() }
