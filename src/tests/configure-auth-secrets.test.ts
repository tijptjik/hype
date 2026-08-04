import { describe, expect, it } from 'vitest'
import {
  buildSecretPutCommand,
  parseDeploymentTargets,
} from '../../scripts/cloud/configure-auth-secrets'

describe('authentication secret configuration', () => {
  it('defaults to the isolated preview and production environments', () => {
    expect(parseDeploymentTargets([])).toEqual(['preview', 'production'])
  })

  it('allows configuring one supported environment', () => {
    expect(parseDeploymentTargets(['preview'])).toEqual(['preview'])
    expect(parseDeploymentTargets(['production'])).toEqual(['production'])
  })

  it('rejects unsupported configuration arguments', () => {
    expect(() => parseDeploymentTargets(['local'])).toThrow(
      'Usage: bun run auth:secrets:configure [preview|production]',
    )
  })

  it('uses the scheduler Wrangler configuration for the shared cleanup token', () => {
    expect(
      buildSecretPutCommand(
        'ANONYMOUS_CLEANUP_TOKEN',
        'production',
        'workers/maintenance-scheduler/wrangler.toml',
      ),
    ).toEqual([
      'bun',
      'wrangler',
      'secret',
      'put',
      'ANONYMOUS_CLEANUP_TOKEN',
      '--config',
      'workers/maintenance-scheduler/wrangler.toml',
      '--env',
      'production',
    ])
  })
})
