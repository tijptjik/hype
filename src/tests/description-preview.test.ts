// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HtmlPreview from '#lib/bits/custom/htmlPreview/HtmlPreview.svelte'
import TextAreaField from '#lib/bits/custom/form/TextAreaField.svelte'

vi.mock('#lib/client/services/form.js', () => ({
  handleTrimmedTextControlBlur: vi.fn(),
}))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

describe('description HTML previews', () => {
  it('renders formatting and safe links while removing executable markup', async () => {
    const { container } = render(HtmlPreview, {
      html: '<p>Hello <strong>Hong Kong</strong> <a href="https://example.com">link</a></p><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><form><input name="data.code"></form>',
    })
    await waitFor(() =>
      expect(container.querySelector('strong')?.textContent).toBe('Hong Kong'),
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com',
    )
    expect(container.querySelector('script, form, input, [onerror]')).toBeNull()
    expect(container.querySelectorAll('a')[1].hasAttribute('href')).toBe(false)
  })

  it('keeps the original source in the bound control when switching modes', async () => {
    const source = '<p>A <a href="https://example.com">description</a></p>'
    const { container, rerender } = render(TextAreaField, {
      value: source,
      renderHtml: true,
      isEditing: false,
      label: 'Description',
      textareaAttrs: { name: 'data.i18n.en.description' },
    })
    await waitFor(() => expect(container.querySelector('a')).not.toBeNull())
    const textarea = container.querySelector('textarea')
    if (!textarea) throw new Error('Expected the bound description textarea')
    expect(textarea.value).toBe(source)
    expect(textarea.name).toBe('data.i18n.en.description')
    expect(textarea.closest('.hidden')).not.toBeNull()
    await rerender({ isEditing: true })
    expect(container.querySelector('a')).toBeNull()
    expect(textarea.closest('.hidden')).toBeNull()
    expect(textarea.value).toBe(source)
    expect(textarea.readOnly).toBe(false)
  })
})
