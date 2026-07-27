import { readFileSync } from 'node:fs'
import { exit } from 'node:process'

const PATCHED_QUERY_PATH =
  'node_modules/@sveltejs/kit/src/runtime/client/remote-functions/query/index.js'

const EXPECTED_SNIPPETS = [
  'await goto(result.redirect);\n\t\t\t\treturn;',
  'return result._;',
]

/**
 * Verifies that Bun applied the local SvelteKit query patch.
 *
 * @returns Process exit code.
 * @remarks This intentionally checks installed package contents so stale
 * node_modules caches fail before build or deploy steps can run.
 */
const verifySvelteKitPatch = (): number => {
  try {
    const source = readFileSync(PATCHED_QUERY_PATH, 'utf8')

    if (EXPECTED_SNIPPETS.every(snippet => source.includes(snippet))) {
      return 0
    }
  } catch (error) {
    console.error(`Unable to read ${PATCHED_QUERY_PATH}`)
    console.error(error)
    return 1
  }

  console.error('SvelteKit patch is missing from installed dependencies.')
  console.error(`Expected to find the patched query return flow in ${PATCHED_QUERY_PATH}.`)

  return 1
}

exit(verifySvelteKitPatch())
