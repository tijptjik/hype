import { describe, expect, it } from 'vitest'

import {
  createDefaultHubPrivacyPolicy,
  createDefaultHubTermsOfService,
  renderPolicyMarkdown,
} from '$lib/services/policy'

describe('policy defaults', () => {
  it('substitutes hub name and a human-readable date into the privacy template', () => {
    const policy = createDefaultHubPrivacyPolicy(
      'en',
      'Central Archive',
      null,
      'legal@archive.hk',
      new Date('2026-04-10T00:00:00.000Z'),
    )

    expect(policy).toContain('# **Central Archive Privacy Policy**')
    expect(policy).toContain('**Last Updated:** April 10, 2026')
    expect(policy).toContain(
      'This Privacy Policy explains how **Central Archive** ("**we**", "**us**", "**our**")',
    )
    expect(policy).toContain('[legal@archive.hk]')
  })

  it('falls back to HYPE when no localized hub name is available', () => {
    const policy = createDefaultHubTermsOfService(
      'en',
      '',
      '',
      '',
      new Date('2026-04-10T00:00:00.000Z'),
    )

    expect(policy).toContain('# **HYPE Terms of Service**')
    expect(policy).toContain('By using HYPE ("we", "our", "us"), you agree')
    expect(policy).toContain('legal@hype.hk')
  })
})

describe('renderPolicyMarkdown', () => {
  it('renders headings, lists, tables, emphasis, and horizontal rules', () => {
    const html = renderPolicyMarkdown(`# Title

**Last Updated:** April 10, 2026

---

## Section

- **One:** First item
- Two

| Name | Value |
|------|-------|
| Alpha | Beta |
`)

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<p><strong>Last Updated:</strong> April 10, 2026</p>')
    expect(html).toContain('<hr />')
    expect(html).toContain('<h2>Section</h2>')
    expect(html).toContain(
      '<ul><li><strong>One:</strong> First item</li><li>Two</li></ul>',
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<th>Name</th>')
    expect(html).toContain('<td>Beta</td>')
  })

  it('escapes raw HTML before applying markdown formatting', () => {
    const html = renderPolicyMarkdown('<script>alert("xss")</script>\n\n**safe**')

    expect(html).toContain('<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>')
    expect(html).toContain('<p><strong>safe</strong></p>')
    expect(html).not.toContain('<script>')
  })

  it('renders policy line breaks and bracketed email addresses', () => {
    const html = renderPolicyMarkdown(
      '[privacy@hype.hk]\n\nMart van de Ven<br>\n14/F, 8 Hennessy Rd,<br>',
    )

    expect(html).toContain('<a href="mailto:privacy@hype.hk">privacy@hype.hk</a>')
    expect(html).toContain('<p>Mart van de Ven<br /> 14/F, 8 Hennessy Rd,<br /></p>')
  })
})
