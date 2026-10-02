import { readFileSync } from 'node:fs'
import { exit } from 'node:process'

const PATCHED_QUERY_PATH =
  'node_modules/@sveltejs/kit/src/runtime/client/remote-functions/query/index.js'

const PATCHED_GUARD_PATH =
  'node_modules/@sveltejs/kit/src/exports/vite/plugins/guard.js'

const EXPECTED_SNIPPETS = [
  'await _goto(result.redirect);\n\t\t\t\treturn;',
  'return result._;',
]

/**
 * Verifies that Bun applied the local SvelteKit 3 query and remote-module patches.
 *
 * @returns Process exit code.
 * @remarks This intentionally checks installed package contents so stale
 * node_modules caches fail before build or deploy steps can run.
 */
const verifySvelteKitPatch = (): number => {
  try {
    const source = readFileSync(PATCHED_QUERY_PATH, 'utf8')

    const guard = readFileSync(PATCHED_GUARD_PATH, 'utf8')

    if (
      EXPECTED_SNIPPETS.every(snippet => source.includes(snippet)) &&
      guard.includes('if (kit.experimental.remoteFunctions && is_remote_module(id)) return;')
    ) {
      return 0
    }
  } catch (error) {
    console.error('Unable to read the installed SvelteKit patch targets.')
    console.error(error)
    return 1
  }

  console.error('SvelteKit patch is missing from installed dependencies.')
  console.error(`Expected query return flow in ${PATCHED_QUERY_PATH} and remote-module handling in ${PATCHED_GUARD_PATH}.`)

  return 1
}

exit(verifySvelteKitPatch())
