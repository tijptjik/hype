// DOMAIN
import {
  parseDisplayTemplate,
  renderDisplayTemplate,
} from '../templates/displayTemplate'

/** Split a saved session identifier into its mapped site code and original sequence.
 * @param title Saved Feature title. @param code Session code. @param template Effective layer or session title template.
 * @returns Monospace tag texts, or an empty list for custom titles that should be shown in full.
 */
export function recorderIdentifierTags(
  title: string | null,
  code: string | null,
  template: string | null,
): string[] {
  if (!title || !code || !template || !title.startsWith(code + '-')) return []
  const rest = title.slice(code.length + 1)
  const match = /^(?:(.*)-)?(\d+)$/.exec(rest)
  if (!match) return []
  try {
    const { parts, components } = parseDisplayTemplate(template)
    const [prefix, separator, middle, next, sequence] = parts
    if (
      typeof prefix === 'string' ||
      prefix?.kind !== 'property' ||
      prefix.path !== 'session.code' ||
      separator !== '-'
    )
      return []
    const number = '#' + match[2]
    if (
      parts.length === 3 &&
      typeof middle !== 'string' &&
      middle.kind === 'sequence' &&
      !match[1]
    )
      return [number]
    if (
      parts.length !== 5 ||
      next !== '-' ||
      typeof sequence === 'string' ||
      sequence.kind !== 'sequence' ||
      typeof middle === 'string'
    )
      return []
    if (
      middle.kind !== 'property' &&
      !(
        middle.kind === 'call' &&
        middle.name === 'cases' &&
        middle.args.length !== 4 &&
        middle.args[0].kind === 'property'
      )
    )
      return []
    let site = match[1] ?? ''
    if (middle.kind === 'call' && middle.args[0].kind === 'property') {
      // Older titles contain the full option label. Replay just the author's mapping for display.
      const { start, end } = components[1]
      site = renderDisplayTemplate(
        template.slice(start, end),
        { [middle.args[0].path]: site },
        { ignoreCase: true },
      )
    }
    return site ? [site.toUpperCase(), number] : [number]
  } catch {
    // A legacy template can still have a readable stored title.
    return []
  }
}
