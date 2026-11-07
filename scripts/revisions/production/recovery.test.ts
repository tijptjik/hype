// TESTS
import { expect, test } from 'bun:test'
// NODE
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// STORAGE
import { AwsClient } from 'aws4fetch'
import { checkpoint } from './recovery'

test('encrypts a recoverable archive and verifies remote ciphertext without uploading plaintext', async () => {
  const root = mkdtempSync(join(tmpdir(), 'revision-recovery-test-'))
  const original = AwsClient.prototype.fetch
  const variables = [
    'REVISION_RECOVERY_PUBLIC_KEY',
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_S3_ACCESS_KEY_ID',
    'R2_S3_SECRET_ACCESS_KEY',
  ]
  const before = variables.map(key => process.env[key])
  try {
    const home = join(root, 'keys'),
      run = join(root, 'release')
    mkdirSync(home, { mode: 0o700 })
    mkdirSync(run)
    const generated = Bun.spawnSync([
      'gpg',
      '--homedir',
      home,
      '--batch',
      '--passphrase',
      '',
      '--quick-generate-key',
      'Rollout test',
      'rsa2048',
      'encr',
      '1d',
    ])
    expect(generated.exitCode).toBe(0)
    process.env.REVISION_RECOVERY_PUBLIC_KEY = Bun.spawnSync([
      'gpg',
      '--homedir',
      home,
      '--armor',
      '--export',
    ]).stdout.toString()
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test'
    process.env.R2_S3_ACCESS_KEY_ID = 'test'
    process.env.R2_S3_SECRET_ACCESS_KEY = 'test'
    writeFileSync(join(run, 'private.txt'), 'private recovery marker')
    mkdirSync(join(run, 'initial/release/media'), { recursive: true })
    mkdirSync(join(run, 'application/media'), { recursive: true })
    writeFileSync(join(run, 'initial/release/media/original'), 'already in R2')
    writeFileSync(join(run, 'application/media/required'), 'application asset')
    let bytes = new Uint8Array()
    AwsClient.prototype.fetch = (async (_input, init) => {
      if (init?.method === 'PUT') {
        bytes = new Uint8Array(init.body as Uint8Array)
        expect(new TextDecoder().decode(bytes)).not.toContain('private recovery marker')
        return new Response(null, { status: 200 })
      }
      return new Response(bytes)
    }) as typeof original
    await checkpoint(run, 'hype-assets-raw-prod', 'prepared')
    const encrypted = join(root, 'archive.gpg')
    writeFileSync(encrypted, bytes)
    const decrypted = Bun.spawnSync([
      'gpg',
      '--homedir',
      home,
      '--batch',
      '--decrypt',
      encrypted,
    ])
    expect(decrypted.exitCode).toBe(0)
    const archive = join(root, 'archive.tar.gz')
    writeFileSync(archive, decrypted.stdout)
    expect(
      Bun.spawnSync(['tar', '-xzOf', archive, 'release/private.txt']).stdout.toString(),
    ).toBe('private recovery marker')
    const listing = Bun.spawnSync(['tar', '-tzf', archive]).stdout.toString()
    expect(listing).not.toContain('initial/release/media/original')
    expect(listing).toContain('application/media/required')
    delete process.env.REVISION_RECOVERY_PUBLIC_KEY
    await expect(checkpoint(run, 'hype-assets-raw-prod', 'prepared')).rejects.toThrow(
      'credentials missing',
    )
  } finally {
    AwsClient.prototype.fetch = original
    variables.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key]
      else process.env[key] = before[index]
    })
    rmSync(root, { recursive: true, force: true })
  }
})
