// THIRD-PARTY
import { Marked } from 'marked'

/** Escape text and attribute delimiters before generating HTML.
 * @param value Untrusted text. @returns HTML-safe text.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Raw HTML is escaped and links allow only explicit web/email protocols or local paths.
const renderer = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return /^<br\s*\/?\s*>$/i.test(text.trim()) ? '<br>' : escapeHtml(text)
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens)
      if (!/^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href)) return label
      return `<a href="${escapeHtml(href)}">${label}</a>`
    },
    image({ text }) {
      return escapeHtml(text)
    },
  },
})

/** Render editor Markdown with safe HTML, including GFM tables and hard line breaks.
 * @param value Stored Markdown. @returns Safe HTML with raw tags escaped.
 */
export function renderMarkdown(value?: string | null): string {
  return renderer.parse(
    (value ?? '').replace(
      /\[([^\s<>[\]]+@[^\s<>[\]]+\.[^\s<>[\]]+)\](?!\()/g,
      '[$1](mailto:$1)',
    ),
    { async: false },
  )
}

/** Recognize legacy HTML descriptions without treating Markdown autolinks as HTML.
 * @param value Stored description. @returns Whether HTML block or formatting tags occur.
 */
export function isLegacyHtml(value: string): boolean {
  return /<\/?(?:p|div|h[1-6]|ul|ol|li|strong|em|b|i|a|table|blockquote|span)(?:\s|>)/i.test(
    value,
  )
}

/** Render Markdown while retaining legacy HTML until a user edits it.
 * @param value Stored content. @returns HTML for the sanitizing HtmlPreview component.
 * @remarks The returned HTML must be sanitized before insertion into the DOM.
 */
export function renderMarkdownContent(value: string): string {
  return isLegacyHtml(value) ? value : renderMarkdown(value)
}
