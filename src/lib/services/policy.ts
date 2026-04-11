// I18N
import { toLocaleCode } from '$lib/i18n'
// TYPES
import type { LocaleKey } from '$lib/types'
// ASSETS
import privacyPolicyTemplate from '../../../docs/policies/privacy.md?raw'
import termsOfServiceTemplate from '../../../docs/policies/terms.md?raw'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. TEMPLATE DEFAULTS
// - toHubPolicyPartyName
// - toHubPolicyLegalContactAddress
// - toHumanReadablePolicyDate
// - substitutePolicyTemplateTokens
// - createDefaultHubPrivacyPolicy
// - createDefaultHubTermsOfService
//
// 2. MARKDOWN RENDERING
// - escapeHtml
// - renderInlineMarkdown
// - renderTableBlock
// - renderListBlock
// - renderParagraphBlock
// - renderPolicyMarkdown
// ---

/********************
 *  1. TEMPLATE DEFAULTS
 ************/
// +++ Template Defaults

/**
 * Resolves the name token used by generated hub legal copy.
 *
 * @param name - Localized full hub name when available.
 * @param nameShort - Localized short hub name fallback.
 * @returns A human-readable hub label.
 */
function toHubPolicyPartyName(name?: string | null, nameShort?: string | null): string {
  const normalizedName = name?.trim()
  if (normalizedName) return normalizedName

  const normalizedNameShort = nameShort?.trim()
  if (normalizedNameShort) return normalizedNameShort

  return 'HYPE'
}

/**
 * Resolves the legal contact string used by generated hub policy copy.
 *
 * @param legalContactAddress - Hub-level legal contact string when available.
 * @returns A human-readable legal contact value.
 */
function toHubPolicyLegalContactAddress(legalContactAddress?: string | null): string {
  const normalizedLegalContactAddress = legalContactAddress?.trim()
  if (normalizedLegalContactAddress) return normalizedLegalContactAddress

  return 'legal@hype.hk'
}

/**
 * Formats the current date for insertion into default policy templates.
 *
 * @param localeKey - Form locale key used by the hub editor.
 * @param currentDate - Date value to format.
 * @returns Localized long-form date text.
 */
function toHumanReadablePolicyDate(
  localeKey: LocaleKey,
  currentDate: Date = new Date(),
): string {
  return new Intl.DateTimeFormat(toLocaleCode(localeKey), {
    dateStyle: 'long',
  }).format(currentDate)
}

/**
 * Substitutes supported `{{ ... }}` policy template tokens.
 *
 * @param template - Raw markdown template.
 * @param localeKey - Form locale key used by the hub editor.
 * @param name - Localized full hub name when available.
 * @param nameShort - Localized short hub name fallback.
 * @param currentDate - Date value to interpolate into the template.
 * @returns Markdown with the supported template tokens resolved.
 */
function substitutePolicyTemplateTokens(
  template: string,
  localeKey: LocaleKey,
  name?: string | null,
  nameShort?: string | null,
  legalContactAddress?: string | null,
  currentDate: Date = new Date(),
): string {
  const partyName = toHubPolicyPartyName(name, nameShort)
  const resolvedLegalContactAddress =
    toHubPolicyLegalContactAddress(legalContactAddress)
  const currentDateText = toHumanReadablePolicyDate(localeKey, currentDate)

  return template
    .replaceAll(
      /\{\{\s*hub\.name(?:\s*\|\s*"([^"]*)")?\s*\}\}/g,
      (_, fallback) => partyName || fallback || 'HYPE',
    )
    .replaceAll(
      /\{\{\s*hub\.legalContactAddress(?:\s*\|\s*"([^"]*)")?\s*\}\}/g,
      (_, fallback) => resolvedLegalContactAddress || fallback || 'legal@hype.hk',
    )
    .replaceAll(/\{\{\s*date\.today\(\)\s*\}\}/g, currentDateText)
}

/**
 * Builds default privacy policy markdown for hub forms.
 *
 * @param localeKey - Form locale key used by the hub editor.
 * @param name - Localized full hub name when available.
 * @param nameShort - Localized short hub name fallback.
 * @param currentDate - Date value to interpolate into the template.
 * @returns Default privacy policy markdown for the hub locale.
 */
export function createDefaultHubPrivacyPolicy(
  localeKey: LocaleKey,
  name?: string | null,
  nameShort?: string | null,
  legalContactAddress?: string | null,
  currentDate: Date = new Date(),
): string {
  return substitutePolicyTemplateTokens(
    privacyPolicyTemplate.trim(),
    localeKey,
    name,
    nameShort,
    legalContactAddress,
    currentDate,
  )
}

/**
 * Builds default terms of service markdown for hub forms.
 *
 * @param localeKey - Form locale key used by the hub editor.
 * @param name - Localized full hub name when available.
 * @param nameShort - Localized short hub name fallback.
 * @param currentDate - Date value to interpolate into the template.
 * @returns Default terms markdown for the hub locale.
 */
export function createDefaultHubTermsOfService(
  localeKey: LocaleKey,
  name?: string | null,
  nameShort?: string | null,
  legalContactAddress?: string | null,
  currentDate: Date = new Date(),
): string {
  return substitutePolicyTemplateTokens(
    termsOfServiceTemplate.trim(),
    localeKey,
    name,
    nameShort,
    legalContactAddress,
    currentDate,
  )
}

// ---
/********************
 *  2. MARKDOWN RENDERING
 ************/
// +++ Markdown Rendering

/**
 * Escapes HTML-significant characters so policy markdown cannot inject raw HTML.
 *
 * @param value - Raw text fragment.
 * @returns Escaped text safe for HTML output.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Detects whether a bracketed literal should become a `mailto:` link.
 *
 * @param value - Candidate link label from the markdown source.
 * @returns `true` when the value is a plain email address.
 */
function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Renders inline markdown features used by the policy templates.
 *
 * @param value - Raw text fragment.
 * @returns HTML string for inline formatting.
 */
function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br />')
    .replace(/\[([^\]]+)\]/g, (match, label) =>
      isEmailAddress(label) ? `<a href="mailto:${label}">${label}</a>` : match,
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

/**
 * Parses a markdown table row into cell values.
 *
 * @param row - Raw markdown table row.
 * @returns Renderable cell values.
 */
function parseTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

/**
 * Renders a markdown table block into HTML.
 *
 * @param lines - Markdown lines starting at a table header row.
 * @param startIndex - Index of the first row in the block.
 * @returns HTML output and the next unread line index.
 */
function renderTableBlock(
  lines: string[],
  startIndex: number,
): { html: string; nextIndex: number } {
  const rows: string[][] = []
  let index = startIndex

  while (index < lines.length && lines[index].includes('|')) {
    rows.push(parseTableRow(lines[index]))
    index += 1
  }

  const [headerRow, , ...bodyRows] = rows
  const thead = `<thead><tr>${headerRow
    .map(cell => `<th>${renderInlineMarkdown(cell)}</th>`)
    .join('')}</tr></thead>`
  const tbody = bodyRows.length
    ? `<tbody>${bodyRows
        .map(
          row =>
            `<tr>${row.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`,
        )
        .join('')}</tbody>`
    : ''

  return {
    html: `<table>${thead}${tbody}</table>`,
    nextIndex: index,
  }
}

/**
 * Renders a consecutive markdown list block into HTML.
 *
 * @param lines - Markdown lines.
 * @param startIndex - Index of the first list row.
 * @param ordered - Whether the block is ordered.
 * @returns HTML output and the next unread line index.
 */
function renderListBlock(
  lines: string[],
  startIndex: number,
  ordered: boolean,
): { html: string; nextIndex: number } {
  const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*-\s+(.+)$/
  const items: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const match = lines[index].match(pattern)
    if (!match) break

    items.push(`<li>${renderInlineMarkdown(match[1])}</li>`)
    index += 1
  }

  return {
    html: ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`,
    nextIndex: index,
  }
}

/**
 * Renders a paragraph block by collapsing wrapped markdown lines.
 *
 * @param lines - Markdown lines.
 * @param startIndex - Index of the first paragraph row.
 * @returns HTML output and the next unread line index.
 */
function renderParagraphBlock(
  lines: string[],
  startIndex: number,
): { html: string; nextIndex: number } {
  const parts: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index].trim()
    const nextLine = lines[index + 1]?.trim() ?? ''

    if (!line) break
    if (/^(#{1,6})\s+/.test(line)) break
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) break
    if (/^\s*-\s+/.test(line)) break
    if (/^\s*\d+\.\s+/.test(line)) break
    if (line.includes('|') && /^\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(nextLine)) break

    parts.push(line)
    index += 1
  }

  return {
    html: `<p>${renderInlineMarkdown(parts.join(' '))}</p>`,
    nextIndex: index,
  }
}

/**
 * Renders stored policy markdown into safe HTML for `{@html}`.
 *
 * @param markdown - Trusted markdown string stored for the hub.
 * @returns Sanitized HTML string suitable for Svelte `{@html}`.
 * @remarks Raw HTML is always escaped before markdown formatting is applied.
 */
export function renderPolicyMarkdown(markdown?: string | null): string {
  if (!markdown?.trim()) return ''

  const lines = markdown.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()

    if (!line) {
      index += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push('<hr />')
      index += 1
      continue
    }

    if (
      line.includes('|') &&
      /^\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1]?.trim() ?? '')
    ) {
      const { html, nextIndex } = renderTableBlock(lines, index)
      blocks.push(html)
      index = nextIndex
      continue
    }

    if (/^\s*-\s+/.test(line)) {
      const { html, nextIndex } = renderListBlock(lines, index, false)
      blocks.push(html)
      index = nextIndex
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const { html, nextIndex } = renderListBlock(lines, index, true)
      blocks.push(html)
      index = nextIndex
      continue
    }

    const { html, nextIndex } = renderParagraphBlock(lines, index)
    blocks.push(html)
    index = nextIndex
  }

  return blocks.join('\n')
}

// ---
