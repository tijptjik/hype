// TESTS
import { describe, expect, it } from 'vitest'
// SERVICES
import {
  isLegacyHtml,
  renderMarkdown,
  renderMarkdownContent,
} from '#lib/services/markdown.js'

describe('Milkdown content rendering', () => {
  it('renders tables, links, emphasis and serialized hard breaks', () => {
    const html = renderMarkdown(
      '# Policy\n\n[Contact](mailto:privacy@hype.hk)\n\n**Address**  \nHong Kong\n\n| Party | Role |\n| --- | --- |\n| HYPE | Controller |',
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<td>Controller</td>')
    expect(html).toContain('href="mailto:privacy@hype.hk"')
    expect(html).toMatch(/<strong>Address<\/strong><br\s*\/?>\s*Hong Kong/)
  })
  it('escapes raw HTML and removes executable links and images', () => {
    for (const value of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '[click](javascript:alert%281%29)',
      '[click](data:text/html,test)',
      '[click](javascript&#58;alert%281%29)',
    ]) {
      const html = renderMarkdown(value)
      expect(html).not.toMatch(/<(?:script|img)\b|href="(?:javascript|data):/i)
    }
  })
  it('retains legacy descriptions for the sanitizing preview without confusing autolinks', () => {
    const html = '<p>Legacy <strong>description</strong></p>'
    expect(isLegacyHtml(html)).toBe(true)
    expect(renderMarkdownContent(html)).toBe(html)
    expect(isLegacyHtml('<https://hype.hk>')).toBe(false)
    expect(renderMarkdown('Contact<br>Hong Kong')).toContain('<br>')
  })
})
