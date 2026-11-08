// THIRD-PARTY
import { describe, expect, it } from 'vitest'
// SHARING
import {
  parseSharePath,
  shareIntent,
  sharePath,
  sharePlainText,
} from '#lib/sharing/resource.js'

describe('public resource addresses', () => {
  it.each(['organisation', 'project', 'layer', 'feature'] as const)(
    'round trips %s references without interpreting punctuation',
    kind => {
      const target = { kind, ref: 'A name/香港?&' }
      expect(parseSharePath(sharePath(target))).toEqual(target)
    },
  )
  it('rejects unrelated routes and malformed escaping', () => {
    expect(parseSharePath('/admin/projects/example')).toBeNull()
    expect(parseSharePath('/project/%ZZ')).toBeNull()
  })
  it('encodes platform payloads without losing query parameters or Unicode', () => {
    const url = 'https://example.hk/project/%E9%A6%99%E6%B8%AF'
    expect(new URL(shareIntent('facebook', 'A & B', url)).searchParams.get('u')).toBe(
      url,
    )
    expect(new URL(shareIntent('threads', 'A & B', url)).searchParams.get('text')).toBe(
      `A & B\n${url}`,
    )
    expect(new URL(shareIntent('x', 'A & B', url)).searchParams.get('text')).toBe(
      'A & B',
    )
  })
  it('turns rich descriptions into readable preview text', () => {
    expect(sharePlainText('<p>Hong Kong &amp; <b>neon</b></p>')).toBe(
      'Hong Kong & neon',
    )
  })
})
