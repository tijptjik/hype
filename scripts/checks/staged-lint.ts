// NODE
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
 * Validate an immutable copy of the staged tree without rewriting either index or files.
 * @param cwd Directory within the repository to validate.
 * @returns Nothing when all staged content passes the configured checks.
 * @remarks Configuration, tool-version and lockfile changes trigger a full-tree check.
 */
export function checkStaged(cwd = process.cwd()): void {
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
    if (files.length === 0) return

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
    const fullTree = files.some(file =>
      /(^|\/)(biome\.jsonc?|package\.json|bun\.lockb?|\.gitignore)$/.test(file),
    )
    const biome = join(toolsRoot, 'node_modules/.bin/biome')
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
          '--no-errors-on-unmatched',
          '--files-ignore-unknown=true',
          ...paths,
        ],
        snapshot,
        toolEnv,
      )
    }
    const markdown = files.filter(file => file.endsWith('.md')).map(file => `./${file}`)
    if (markdown.length > 0) {
      run(
        [join(toolsRoot, 'node_modules/.bin/prettier'), '--check', ...markdown],
        snapshot,
        toolEnv,
      )
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try {
    checkStaged()
    console.log('Staged lint checks passed; no files were rewritten.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error(
      'Fix the reported files, review the diff, and stage only the intended changes.',
    )
    process.exitCode = 1
  }
}
