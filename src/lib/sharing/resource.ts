export type ShareKind = 'organisation' | 'project' | 'layer' | 'feature'
export type ShareTarget = { kind: ShareKind; ref: string; title: string }
export type ShareResource = ShareTarget & {
  id: string
  path: string
  description: string
  image: string
}

/** Builds a stable public address from a code or immutable ID.
 * @param target Resource reference. @returns Encoded public path.
 */
export function sharePath(target: Pick<ShareTarget, 'kind' | 'ref'>): string {
  return `/${target.kind === 'feature' ? 'features' : target.kind}/${encodeURIComponent(target.ref)}`
}

/** Recognizes public resource addresses without interpreting display names as codes.
 * @param pathname URL pathname. @returns Resource reference, or null.
 */
export function parseSharePath(
  pathname: string,
): Pick<ShareTarget, 'kind' | 'ref'> | null {
  const match = /^\/(organisation|project|layer|features)\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  try {
    return {
      kind: match[1] === 'features' ? 'feature' : (match[1] as ShareKind),
      ref: decodeURIComponent(match[2]),
    }
  } catch {
    return null
  }
}

/** Creates a platform composer URL with correctly encoded text and resource URL.
 * @param platform Supported web composer. @param title Resource title.
 * @param url Public resource URL. @returns External composer URL.
 */
export function shareIntent(
  platform: 'facebook' | 'threads' | 'x',
  title: string,
  url: string,
): string {
  if (platform === 'facebook')
    return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url })}`
  if (platform === 'threads')
    return `https://www.threads.net/intent/post?${new URLSearchParams({ text: `${title}\n${url}` })}`
  return `https://twitter.com/intent/tweet?${new URLSearchParams({ text: title, url })}`
}

/** Removes markup from crawler descriptions and collapses whitespace.
 * @param value Authored rich text. @returns Plain preview text.
 */
export function sharePlainText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}
