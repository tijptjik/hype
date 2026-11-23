// NODE
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
// STORAGE
import { AwsClient } from 'aws4fetch'

/** Verify the restored database and source export remain intact on the operator's disk.
 * @param snapshot Directory holding a completed D1 export and its checked SQLite restore.
 * @returns A receipt local to this snapshot. Later checks reject changed backup bytes.
 */
export async function verifyLocalBackup(snapshot: string): Promise<void> {
  const hashes: Record<string, string> = {}
  for (const name of ['source.sql', 'schema.json', 'source.sqlite']) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(join(snapshot, name))) hash.update(chunk)
    hashes[name] = hash.digest('hex')
  }
  const file = join(snapshot, 'local-backup.sha256.json')
  const receipt = JSON.stringify(hashes, null, 2) + '\n'
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') !== receipt)
      throw new Error('Local backup differs from its receipt')
  } else {
    writeFileSync(file, receipt, { flag: 'wx', mode: 0o600 })
  }
}

/** Save an encrypted, hash-addressed recovery checkpoint before any irreversible stage.
 * @param directory Private release artifact directory.
 * @param bucket Same-environment private original bucket.
 * @param label Stage identifier.
 * @returns Verified immutable R2 object reference.
 * @remarks Only a public encryption key is present on the deploy host. Media bytes are
 * already retained in R2 and omitted from this archive; plans, exports and app bundles remain recoverable.
 */
export async function checkpoint(
  directory: string,
  bucket: string,
  label: string,
): Promise<{ key: string; hash: string }> {
  const publicKey = process.env.REVISION_RECOVERY_PUBLIC_KEY
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const accessKey = process.env.R2_S3_ACCESS_KEY_ID,
    secret = process.env.R2_S3_SECRET_ACCESS_KEY
  if (!publicKey || !account || !accessKey || !secret)
    throw new Error(
      'Recovery encryption/R2 credentials missing; no production mutation is permitted',
    )
  if (
    !/^[a-z0-9-]+$/.test(label) ||
    !['hype-assets-raw-prod', 'hype-assets-raw-preview'].includes(bucket)
  )
    throw new Error('Invalid recovery destination')
  const home = mkdtempSync(join(tmpdir(), 'hype-revision-gpg-'))
  const encrypted = join(home, 'checkpoint.gpg')
  try {
    const imported = Bun.spawn(['gpg', '--homedir', home, '--batch', '--import'], {
      stdin: new Blob([publicKey]),
      stdout: 'ignore',
      stderr: 'pipe',
    })
    await new Response(imported.stderr).text()
    if (await imported.exited) throw new Error('Recovery public key import failed')
    const listed = Bun.spawnSync(
      ['gpg', '--homedir', home, '--batch', '--with-colons', '--list-keys'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const lines = listed.stdout.toString().split('\n')
    if (listed.exitCode !== 0 || lines.filter(l => l.startsWith('pub:')).length !== 1)
      throw new Error('Exactly one recovery public key is required')
    const recipient = lines.find(l => l.startsWith('fpr:'))?.split(':')[9]
    if (!recipient) throw new Error('Recovery fingerprint missing')
    // Stream the private archive directly into encryption; no plaintext tarball is written.
    const tar = Bun.spawn(
      [
        'tar',
        `--exclude=${basename(directory)}/*/release/media`,
        '-czf',
        '-',
        '-C',
        dirname(directory),
        basename(directory),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const gpg = Bun.spawn(
      [
        'gpg',
        '--homedir',
        home,
        '--batch',
        '--yes',
        '--trust-model',
        'always',
        '--recipient',
        recipient,
        '--output',
        encrypted,
        '--encrypt',
      ],
      { stdin: tar.stdout, stdout: 'ignore', stderr: 'pipe' },
    )
    await Promise.all([
      new Response(tar.stderr).text(),
      new Response(gpg.stderr).text(),
    ])
    if ((await tar.exited) || (await gpg.exited))
      throw new Error('Recovery archive encryption failed')
    const bytes = readFileSync(encrypted),
      hash = createHash('sha256').update(bytes).digest('hex')
    const key = `deployment-recovery/revisions/${basename(directory)}/${label}-${hash}.tar.gpg`
    const client = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secret,
      service: 's3',
      region: 'auto',
    })
    const url = `https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`
    const written = await client.fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/pgp-encrypted', 'if-none-match': '*' },
      body: bytes,
      signal: AbortSignal.timeout(120_000),
    })
    if (!written.ok && written.status !== 412)
      throw new Error('Recovery checkpoint upload failed')
    const read = await client.fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (
      !read.ok ||
      createHash('sha256')
        .update(new Uint8Array(await read.arrayBuffer()))
        .digest('hex') !== hash
    )
      throw new Error('Recovery checkpoint verification failed')
    const result = { bucket, key, hash, recipient, stage: label }
    writeFileSync(
      join(directory, `recovery-${label}.json`),
      JSON.stringify(result, null, 2) + '\n',
      { mode: 0o600 },
    )
    console.info(`Verified encrypted recovery checkpoint: ${bucket}/${key}`)
    return result
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}
