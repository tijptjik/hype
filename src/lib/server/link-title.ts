// SVELTEKIT
import { dev } from '$app/env'
// NODE
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { resolve4, resolve6 } from 'node:dns/promises'
import { isIP } from 'node:net'

// TABLE OF CONTENTS: destination validation; bounded retrieval; title extraction.

/** Checks whether a resolved address is eligible for public page metadata requests.
 * @param address Resolved IPv4 or IPv6 address.
 * @returns Whether the address is globally routable unicast.
 */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 88, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    )
  }
  // Accept only global IPv6 unicast; exclude documentation, transition ranges
  // and mapped IPv4, including compressed forms of the 2001::/23 special block.
  if (isIP(address) !== 6 || !/^[23]/i.test(address) || /^2002:|^3fff:/i.test(address))
    return false
  if (/^2001:/i.test(address)) {
    const subnet = Number.parseInt(address.split(':')[1] || '0', 16)
    if (subnet < 0x200 || subnet === 0xdb8) return false
  }
  return true
}

/** Validates each destination, including redirects, before retrieving metadata.
 * @param url Candidate destination.
 * @returns A validated public destination address.
 */
async function validateDestination(url: URL): Promise<string> {
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('Use a public HTTP or HTTPS page')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (
    !hostname.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(hostname)
  )
    throw new Error('Use a public website')
  const addresses = isIP(hostname)
    ? [hostname]
    : (
        await Promise.all([
          resolve4(hostname).catch(() => [] as string[]),
          resolve6(hostname).catch(() => [] as string[]),
        ])
      ).flat()
  if (!addresses.length || !addresses.every(isPublicAddress))
    throw new Error('Use a public website')
  return addresses[0]
}

/** Pins local development requests to the validated IP to prevent DNS rebinding.
 * @param url Public page URL retaining its TLS hostname.
 * @param address Previously validated public IP.
 * @param signal Shared request deadline.
 * @returns Streaming response without automatic redirects or ambient credentials.
 * @remarks Production uses Workers public-network fetch; local Node requests need
 * explicit IP pinning because the development server can reach private networks.
 */
async function requestPage(
  url: URL,
  address: string,
  signal: AbortSignal,
): Promise<Response> {
  const headers = { Accept: 'text/html', Range: 'bytes=0-131071' }
  if (!dev)
    return fetch(url, { redirect: 'manual', signal, credentials: 'omit', headers })
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest
    const outgoing = request(
      {
        protocol: url.protocol,
        hostname: address,
        servername: url.hostname,
        port: url.protocol === 'https:' ? 443 : 80,
        path: url.pathname + url.search,
        method: 'GET',
        signal,
        headers: { ...headers, Host: url.host },
      },
      response => {
        const responseHeaders = new Headers()
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined)
            responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value)
        }
        const status = response.statusCode ?? 502
        const body = [204, 205, 304].includes(status)
          ? null
          : (Readable.toWeb(response) as unknown as ReadableStream<Uint8Array>)
        if (!body) response.destroy()
        resolve(new Response(body, { status, headers: responseHeaders }))
      },
    )
    outgoing.on('error', reject)
    outgoing.end()
  })
}

/** Decodes title text without returning executable HTML.
 * @param text HTML title contents.
 * @returns Plain title, bounded to the link-label limit.
 */
function plainTitle(text: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
  }
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (whole, key: string) => {
      if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? whole
      const code =
        key[1].toLowerCase() === 'x'
          ? Number.parseInt(key.slice(2), 16)
          : Number(key.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 256)
}

/** Retrieves only a public page's title; never forwards user credentials.
 * @param input Absolute page URL.
 * @returns Plain title and detected label locale, or null for pages without a title.
 * @remarks Redirects are revalidated; response size, redirects and duration are bounded.
 */
export async function fetchLinkTitle(
  input: string,
): Promise<{ title: string; locale: 'en' | 'zhHant' | 'zhHans' } | null> {
  let url = new URL(input)
  const signal = AbortSignal.timeout(6000)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const address = await validateDestination(url)
    signal.throwIfAborted()
    const response = await requestPage(url, address, signal)
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) return null
      url = new URL(location, url)
      continue
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      await response.body?.cancel()
      return null
    }
    // Stop reading once the head is complete or the metadata budget is exhausted.
    const reader = response.body?.getReader()
    if (!reader) return null
    const decoder = new TextDecoder()
    let html = '',
      bytes = 0
    try {
      while (bytes < 131072) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value.subarray(0, 131072 - bytes)
        bytes += chunk.length
        html += decoder.decode(chunk, { stream: true })
        if (/<\/head\s*>/i.test(html)) break
      }
    } finally {
      await reader.cancel()
    }
    const title = plainTitle(
      /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? '',
    )
    const lang = /<html\b[^>]*\blang\s*=\s*["']([^"']+)/i.exec(html)?.[1] ?? ''
    return title
      ? {
          title,
          locale: /^zh-(?:hant|hk|tw)/i.test(lang)
            ? 'zhHant'
            : /^zh/i.test(lang)
              ? 'zhHans'
              : 'en',
        }
      : null
  }
  return null
}
