import { resolveEmbedTargetId } from '#lib/embed/target.js'
import type { EmbedLayer } from '#lib/embed/embed.types.js'
import { describe, expect, it } from 'vitest'
import {
  isEmbedCamera,
  parseEmbedConfig,
  embedUrl,
  initialActiveLayers,
  embedMarkup,
} from '#lib/embed/config.js'
import { shouldBootstrapAnonymous } from '#lib/auth/bootstrap.js'
import { isPublicUnauthenticatedPath } from '#lib/auth/redirectGuard.js'

describe('public embed configuration', () => {
  it('fails closed for empty scope and unsupported configuration', () => {
    for (const query of [
      '',
      'layers=',
      'v=2&layers=a',
      'layers=a&mapStyle=hyperAdmin',
      'layers=a&view=Infinity,0,1',
      'layers=a&view=0,91,1',
    ]) {
      expect(() => parseEmbedConfig(new URLSearchParams(query))).toThrow()
    }
  })
  it('keeps filters available and validates supported and primary languages', () => {
    const config = parseEmbedConfig(
      new URLSearchParams('layers=a&languages=en,zh-Hant&lang=zh-Hant&filters=0'),
    )
    expect(config.filters).toBe(true)
    expect(config.languages).toEqual(['en', 'zh-Hant'])
    expect(
      parseEmbedConfig(new URL(embedUrl(config), 'https://hype.hk').searchParams),
    ).toEqual(config)
    expect(embedUrl(config)).not.toContain('filters=')
    for (const query of ['languages=', 'languages=xx', 'languages=zh-Hant&lang=en'])
      expect(() => parseEmbedConfig(new URLSearchParams(`layers=a&${query}`))).toThrow()
    expect(parseEmbedConfig(new URLSearchParams('layers=a')).languages).toEqual([
      'en',
      'zh-Hant',
      'zh-Hans',
    ])
  })
  it('round trips tilt and bearing while retaining old camera links', () => {
    const config = parseEmbedConfig(
      new URLSearchParams('layers=a&view=114.17,22.3,13,55,-35'),
    )
    expect(config.camera).toEqual([114.17, 22.3, 13, 55, -35])
    expect(
      parseEmbedConfig(new URL(embedUrl(config), 'https://hype.hk').searchParams)
        .camera,
    ).toEqual(config.camera)
    expect(
      parseEmbedConfig(new URLSearchParams('layers=a&view=114,22,10')).camera,
    ).toEqual([114, 22, 10])
    for (const value of [
      [114, 22, 10, 90, 0],
      [114, 22, 10, 30, 181],
      [114, 22, 10, 30],
      [114, 22, 10, NaN, 0],
    ])
      expect(isEmbedCamera(value)).toBe(false)
  })
  it('preserves mixed union selections and explicit empty visibility', () => {
    const config = parseEmbedConfig(
      new URLSearchParams(
        'hubs=h&organisations=o,o&projects=p&layers=history:l&active=',
      ),
    )
    expect(config.organisations).toEqual(['o'])
    expect(config.active).toEqual([])
    expect(
      parseEmbedConfig(new URL(embedUrl(config), 'https://hype.hk').searchParams),
    ).toEqual(config)
    expect(initialActiveLayers(config, ['l', 'm'])).toEqual([])
  })
  it('discards defaults outside the included set and enables a singleton', () => {
    expect(initialActiveLayers({ active: ['private', 'l'] }, ['l', 'm'])).toEqual(['l'])
    expect(initialActiveLayers({ active: [] }, ['l'])).toEqual(['l'])
    expect(initialActiveLayers({ active: null }, ['l', 'm'])).toEqual(['l', 'm'])
  })
  it('escapes iframe attributes and keeps responsive lazy loading', () => {
    const html = embedMarkup(
      'https://hype.hk/embed?layers=a&active=a',
      'Map " onload="alert(1)',
    )
    expect(html).toContain('&amp;active=a')
    expect(html).toContain('&quot; onload=&quot;')
    expect(html).not.toContain('title="Map " onload=')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('width:100%')
  })
  it('does not bootstrap guest accounts and permits anonymous documents', () => {
    expect(shouldBootstrapAnonymous('/embed')).toBe(false)
    expect(isPublicUnauthenticatedPath('/embed')).toBe(true)
    expect(shouldBootstrapAnonymous('/')).toBe(true)
  })
})

describe('admin embed route targets', () => {
  const rows: EmbedLayer[] = [
    {
      id: 'layer-id',
      code: 'layer-id',
      name: 'Layer',
      projectId: 'project-id',
      projectCode: 'bookstores',
      projectName: 'Bookstores',
      organisationId: 'org-id',
      organisationCode: 'mapping',
      organisationName: 'Mapping',
      hubId: 'hub-id',
      hubCode: 'core',
      hubName: 'Hype',
    },
  ]
  it('resolves route codes without a client resource cache', () => {
    expect(resolveEmbedTargetId(rows, 'project', 'bookstores')).toBe('project-id')
    expect(resolveEmbedTargetId(rows, 'organisation', 'mapping')).toBe('org-id')
    expect(resolveEmbedTargetId(rows, 'hub', 'core')).toBe('hub-id')
    expect(resolveEmbedTargetId(rows, 'layer', 'layer-id')).toBe('layer-id')
    expect(resolveEmbedTargetId(rows, 'project', 'project-id')).toBe('project-id')
  })
  it('never expands an unknown or unshareable route', () => {
    expect(resolveEmbedTargetId(rows, 'project', 'missing')).toBeNull()
    expect(resolveEmbedTargetId([], 'project', 'bookstores')).toBeNull()
    expect(resolveEmbedTargetId(rows, 'user', 'mapping')).toBeNull()
  })
})
