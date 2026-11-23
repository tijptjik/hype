// NODE
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// LOCAL
import { formatMarkdown } from './markdown'

// TOC: Process helpers | Staged snapshot validation | CLI

const toolsRoot = resolve(import.meta.dir, '../..')

/**
 * Run a command without shell interpolation and preserve failure diagnostics.
 * @param args Executable and individual arguments.
 * @param cwd Working directory for the command.
 * @param env Environment, including an optional isolated Git index.
 * @returns Captured stdout on success.
 */
function run(args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  const result = Bun.spawnSync(args, { cwd, env, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) {
    throw new Error(`${args[0]} failed:\n${result.stdout}${result.stderr}`)
  }
  return result.stdout.toString()
}

/**
 * Validate a snapshot of the staged tree, optionally fixing selected staged content.
 * @param cwd Directory within the repository to validate.
 * @param fixMarkdown Whether to apply staged Markdown formatting after validation.
 * @param sortClasses Whether to apply the Tailwind class sorting lint fix.
 * @returns Nothing when all staged content passes the configured checks.
 * @remarks Configuration, tool-version and lockfile changes trigger a full-tree check.
 */
export function checkStaged(
  cwd = process.cwd(),
  fixMarkdown = false,
  sortClasses = false,
): void {
  const repository = run(
    ['git', 'rev-parse', '--show-toplevel'],
    cwd,
    process.env,
  ).trim()
  const mergeHead = run(
    ['git', 'rev-parse', '--git-path', 'MERGE_HEAD'],
    repository,
    process.env,
  ).trim()
  if (existsSync(resolve(repository, mergeHead))) {
    throw new Error('Merge commits are not allowed. Please use rebase instead.')
  }

  const temporary = mkdtempSync(join(tmpdir(), 'hype-staged-lint-'))
  try {
    // Freeze the index so concurrent edits cannot change the snapshot being checked.
    const index = resolve(
      repository,
      run(['git', 'rev-parse', '--git-path', 'index'], repository, process.env).trim(),
    )
    const frozenIndex = join(temporary, 'index')
    copyFileSync(index, frozenIndex)
    const gitEnv = { ...process.env, GIT_INDEX_FILE: frozenIndex }
    const files = run(
      ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
      repository,
      gitEnv,
    )
      .split('\0')
      .filter(Boolean)
    const changed = run(
      ['git', 'diff', '--cached', '--name-only', '-z'],
      repository,
      gitEnv,
    )
      .split('\0')
      .filter(Boolean)
    if (changed.length === 0) return

    // Materialize only staged contents; working-tree edits are deliberately invisible.
    const snapshot = join(temporary, 'tree')
    run(['git', 'checkout-index', '--all', `--prefix=${snapshot}/`], repository, gitEnv)
    const toolEnv = { ...process.env }
    for (const key of Object.keys(toolEnv)) {
      if (key.startsWith('GIT_')) delete toolEnv[key]
    }
    run(
      ['git', '-c', 'init.templateDir=', 'init', '--quiet', snapshot],
      repository,
      toolEnv,
    )
    symlinkSync(join(toolsRoot, 'node_modules'), join(snapshot, 'node_modules'), 'dir')

    // Never validate a newly staged formatter version using an older installation.
    const manifest = JSON.parse(readFileSync(join(snapshot, 'package.json'), 'utf8'))
    const expected = manifest.devDependencies?.['@biomejs/biome']
    const installed = JSON.parse(
      readFileSync(join(toolsRoot, 'node_modules/@biomejs/biome/package.json'), 'utf8'),
    ).version
    if (expected && expected !== installed) {
      throw new Error(
        `Staged Biome version ${expected} differs from installed ${installed}; run bun install first.`,
      )
    }

    // A changed lint policy must be valid for existing files, not just this commit.
    const fullTree = changed.some(file =>
      /(^|\/)(biome\.jsonc?|package\.json|bun\.lockb?|\.gitignore)$/.test(file),
    )
    if (
      !existsSync(join(snapshot, 'biome.json')) &&
      !existsSync(join(snapshot, 'biome.jsonc'))
    ) {
      throw new Error('The staged tree must retain its Biome configuration.')
    }
    const biome = join(toolsRoot, 'node_modules/.bin/biome')
    const markdown = files.filter(
      file => file.endsWith('.md') || /(^|\/)llms\.txt$/.test(file),
    )
    const regularFiles = files.filter(file => lstatSync(join(snapshot, file)).isFile())
    const originals = new Map(
      regularFiles.map(file => [file, readFileSync(join(snapshot, file))]),
    )
    if (fixMarkdown) formatMarkdown(markdown, snapshot, true, toolEnv)
    // Apply only the class-order rule, including its unsafe fix, to staged files.
    if (sortClasses) {
      for (let i = 0; i < regularFiles.length; i += 100) {
        run(
          [
            biome,
            'lint',
            '--write',
            '--unsafe',
            '--only=lint/nursery/useTailwindSortedClasses',
            '--no-errors-on-unmatched',
            '--files-ignore-unknown=true',
            ...regularFiles.slice(i, i + 100).map(file => `./${file}`),
          ],
          snapshot,
          toolEnv,
        )
      }
    }
    const batches = fullTree
      ? [['.']]
      : Array.from({ length: Math.ceil(files.length / 100) }, (_, i) =>
          files.slice(i * 100, (i + 1) * 100).map(file => `./${file}`),
        )
    for (const paths of batches) {
      run(
        [
          biome,
          'check',
          // Advisory warnings must not consume the diagnostic limit and hide blockers.
          '--diagnostic-level=error',
          '--max-diagnostics=none',
          '--no-errors-on-unmatched',
          '--files-ignore-unknown=true',
          ...paths,
        ],
        snapshot,
        toolEnv,
      )
    }
    // Biome checks .md above; adapt .txt inputs using the same staged configuration.
    const llmsCandidates = fullTree
      ? run(['git', 'ls-files', '-z'], repository, gitEnv).split('\0')
      : files
    formatMarkdown(
      llmsCandidates.filter(file => /(^|\/)llms\.txt$/.test(file)),
      snapshot,
      false,
      toolEnv,
    )
    if (fixMarkdown || sortClasses) {
      const formatted = regularFiles.filter(
        file => !originals.get(file)?.equals(readFileSync(join(snapshot, file))),
      )
      if (formatted.length) {
        // Generate a patch from the frozen index, then apply it atomically to the real index.
        const before = run(['git', 'write-tree'], repository, gitEnv).trim()
        run(
          ['git', `--work-tree=${snapshot}`, 'add', '--', ...formatted],
          repository,
          gitEnv,
        )
        const after = run(['git', 'write-tree'], repository, gitEnv).trim()
        const patch = run(
          ['git', 'diff', '--binary', before, after, '--'],
          repository,
          gitEnv,
        )
        const patchFile = join(temporary, 'staged-fixes.patch')
        writeFileSync(patchFile, patch)
        run(['git', 'apply', '--cached', '--', patchFile], repository, process.env)
        // Update a working file only when it still exactly matches the original staged bytes.
        for (const file of formatted) {
          const path = join(repository, file)
          if (existsSync(path) && originals.get(file)?.equals(readFileSync(path))) {
            writeFileSync(path, readFileSync(join(snapshot, file)))
          }
        }
        console.log(`Fixed ${formatted.length} staged file(s).`)
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try {
    checkStaged(
      process.cwd(),
      process.argv.includes('--fix-markdown'),
      process.argv.includes('--sort-classes'),
    )
    console.log('Staged lint checks passed.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error(
      'Fix the reported files, review the diff, and stage only the intended changes.',
    )
    process.exitCode = 1
  }
}
