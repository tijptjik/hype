import { readFileSync } from 'node:fs'
import { exit } from 'node:process'

const PATCHED_QUERY_PATH =
  'node_modules/@sveltejs/kit/src/runtime/client/remote-functions/query/index.js'

const FRAMEWORK_GUARD_PATH =
  'node_modules/@sveltejs/kit/src/exports/vite/plugins/guard.js'

const EXPECTED_SNIPPETS = [
  'await _goto(result.redirect);\n\t\t\t\treturn;',
  'return result._;',
]

/**
 * Verifies the SvelteKit 3 query patch and the unchanged server-only import guard.
 *
 * @returns Process exit code.
 * @remarks This intentionally checks installed package contents so stale
 * node_modules caches fail before build or deploy steps can run.
 */
const verifySvelteKitPatch = (): number => {
  try {
    const source = readFileSync(PATCHED_QUERY_PATH, 'utf8')

    const guard = readFileSync(FRAMEWORK_GUARD_PATH, 'utf8')

    if (
      EXPECTED_SNIPPETS.every(snippet => source.includes(snippet)) &&
      !guard.includes('if (kit.experimental.remoteFunctions && is_remote_module(id)) return;')
    ) {
      return 0
    }
  } catch (error) {
    console.error('Unable to read the installed SvelteKit query runtime and import guard.')
    console.error(error)
    return 1
  }

  console.error('SvelteKit query patch is missing or the obsolete import-guard bypass is still installed.')
  console.error(`Expected query return flow in ${PATCHED_QUERY_PATH} and no remote-module bypass in ${FRAMEWORK_GUARD_PATH}.`)

  return 1
}

exit(verifySvelteKitPatch())
