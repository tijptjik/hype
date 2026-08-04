import { describe, expect, it } from 'vitest'

import { isScannerProbePath } from '$lib/utils/scannerProbe'

describe('isScannerProbePath', () => {
  it.each([
    '/.env',
    '/.env.local',
    '/server/.env.production',
    '/config/env.php',
    '/config/env.json',
    '/env.txt',
    '/credentials.ini',
    '/config/credentials.json',
    '/.git/config',
    '/graphql',
    '/graphql/console',
    '/v1/graphql',
    '/api/graphql',
    '/wp-admin',
    '/wp-admin/plugins.php',
    '/wp-login.php',
    '/wp-content/plugins/example/readme.txt',
    '/wp-includes/version.php',
    '/administrator/index.php',
    '/phpmyadmin/index.php',
    '/pma/',
    '/adminer.php',
    '/cpanel/',
    '/webmail/',
    '/typo3/install.php',
    '/magento/admin',
  ])('recognises the scanner probe %s', pathname => {
    expect(isScannerProbePath(pathname)).toBe(true)
  })

  it.each([
    '/',
    '/map',
    '/api/health',
    '/api/account/passkey',
    '/admin',
    '/manifest.webmanifest',
    '/api/graphql-export',
  ])('allows the application path %s', pathname => {
    expect(isScannerProbePath(pathname)).toBe(false)
  })
})
