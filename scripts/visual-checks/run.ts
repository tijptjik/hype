// NODE
import { fileURLToPath } from 'node:url'
// SCENARIOS
import { visualSuites } from './lib/suites'

/**
 * Select named suites or individual scenarios without executing browser code.
 * @param selectors Suite keys or scenario basenames, with an optional .ts suffix.
 * @returns Unique scenarios in requested order.
 * @remarks Unknown selectors fail before any scenario starts. No default runs all checks.
 */
export function selectChecks(selectors: readonly string[]): string[] {
  if (!selectors.length)
    throw new Error('Choose a suite or check; use --list to browse')
  const available = new Set<string>(Object.values(visualSuites).flat())
  const selected = new Set<string>()
  for (const selector of selectors) {
    if (Object.hasOwn(visualSuites, selector)) {
      for (const check of visualSuites[selector as keyof typeof visualSuites])
        selected.add(check)
    } else {
      const check = selector.replace(/\.ts$/u, '')
      if (!available.has(check)) throw new Error(`Unknown suite or check: ${selector}`)
      selected.add(check)
    }
  }
  return [...selected]
}

/**
 * Run selected checks in separate Bun processes under the caller's dev-check scope.
 * @param args Suite/check selectors or --list.
 * @returns Completion after all selected scenarios pass.
 * @remarks Stops at the first failure. Inherits existing origin overrides and never
 * starts a server, logs into an account or shares browser state between scenarios.
 */
async function main(args: readonly string[]): Promise<void> {
  if (args.length === 1 && args[0] === '--list') {
    for (const [suite, checks] of Object.entries(visualSuites))
      console.log(`${suite}\n${checks.map(check => `  ${check}`).join('\n')}`)
    return
  }
  const checks = selectChecks(args)
  const root = fileURLToPath(new URL('../../', import.meta.url))
  for (const check of checks) {
    console.log(`\n[visual-check] ${check}`)
    const child = Bun.spawn([process.execPath, `scripts/visual-checks/${check}.ts`], {
      cwd: root,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const code = await child.exited
    if (code !== 0) throw new Error(`${check} failed with exit code ${code}`)
  }
}

if (import.meta.main) {
  await main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
