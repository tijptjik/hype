// NODE
import { createInterface } from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Select a safe retry checkpoint from the last persisted rebuild receipt.
 * @param receiptPath Exact receipt emitted by the failed command.
 * @returns Resume arguments, or retained inputs when reconciliation has not completed.
 * @remarks A failed early stage must not pretend it has a resumable user reconciliation.
 */
export function rebuildRetryArguments(receiptPath: string): string[] {
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  if (receipt.applied) throw new Error('This rebuild is already installed')
  if (receipt.userReconciliation?.status === 'passed')
    return ['--resume', dirname(resolve(receiptPath))]
  if (receipt.inputs && receipt.inputHashes)
    return [
      '--inputs',
      String(receipt.inputs),
      ...(receipt.mocks === false ? ['--no-mocks'] : []),
    ]
  throw new Error('No complete export checkpoint yet; start a new rebuild')
}

/** Run private rebuild stages with deliberate retry, recovery and installation choices.
 * @returns Nothing after installation, preparation or a user-requested stop.
 * @remarks Prompts hold no validation slot. Noninteractive automation uses rebuild.ts directly.
 */
async function main(): Promise<void> {
  if (!process.stdin.isTTY)
    throw new Error(
      'Guided rebuild needs a terminal; use db:rebuild:local for automation',
    )
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  let args = process.argv.slice(2)
  // Reproduce the production/Breadline integration without adding synthetic fixtures.
  if (!args.includes('--no-mocks')) args.push('--no-mocks')
  let receiptPath: string | undefined
  try {
    while (true) {
      const child = Bun.spawn(
        ['dev-check', 'bun', '--env-file=.dev.vars', 'scripts/dev/rebuild.ts', ...args],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      let output = ''
      /** Stream status while retaining the explicit checkpoint path.
       * @param stream Child output stream. @param target Parent output sink.
       * @returns Resolves when the stream closes.
       */
      async function relay(
        stream: ReadableStream<Uint8Array>,
        target: NodeJS.WriteStream,
      ): Promise<void> {
        const decoder = new TextDecoder()
        for await (const chunk of stream) {
          const text = decoder.decode(chunk, { stream: true })
          target.write(text)
          output += text
        }
      }
      await Promise.all([
        relay(child.stdout, process.stdout),
        relay(child.stderr, process.stderr),
      ])
      const code = await child.exited
      const failed = output.match(/Rebuild receipt: ([^\r\n]+)/)
      const prepared = output.match(
        /Development rebuild (?:prepared|installed): ([^\r\n]+)/,
      )
      receiptPath =
        failed?.[1] ?? (prepared ? resolve(prepared[1], 'receipt.json') : receiptPath)
      if (code === 0) {
        if (args.includes('--apply')) return
        const answer = await prompt.question(
          'Prepared and verified. Install locally with a backup? [y/N] ',
        )
        if (answer.trim().toLowerCase() !== 'y') return
        if (!receiptPath)
          throw new Error('Successful command did not provide a receipt')
        args = [...rebuildRetryArguments(receiptPath), '--apply']
        continue
      }
      console.error(
        'The failed stage was not accepted. Inspect the reported private log; the active database is unchanged unless installation completed.',
      )
      const answer = (
        await prompt.question(
          'Retry after fixing the error, provide a recovery manifest, or stop? [r/m/S] ',
        )
      )
        .trim()
        .toLowerCase()
      if (answer !== 'r' && answer !== 'm') {
        process.exitCode = code
        return
      }
      const prior = args
      if (receiptPath) args = rebuildRetryArguments(receiptPath)
      if (prior.includes('--apply')) args.push('--apply')
      for (const flag of ['--identity-review', '--messaging-organisation']) {
        const index = prior.indexOf(flag)
        if (index >= 0) args.push(flag, prior[index + 1])
      }
      if (answer === 'm') {
        const manifest = (
          await prompt.question('Path to approved exact-match recovery manifest: ')
        ).trim()
        if (!manifest) throw new Error('Recovery manifest is required')
        args.push('--recovery-manifest', resolve(manifest))
      } else {
        const index = prior.indexOf('--recovery-manifest')
        if (index >= 0) args.push('--recovery-manifest', prior[index + 1])
      }
    }
  } finally {
    prompt.close()
  }
}

if (import.meta.main)
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
