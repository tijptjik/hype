// NODE
import { execFileSync } from 'node:child_process'
// TESTING
import { describe, expect, it } from 'vitest'

/**
 * Runs installed framework modules outside Vite's own remote-module transforms.
 * @param script - Native ESM regression probe.
 * @returns The probe's standard output; assertion failures reject the test.
 */
function runFrameworkProbe(script: string): string {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

describe('SvelteKit 3 dependency patches', () => {
  it('allows transformed remote modules in server directories and rejects ordinary server imports', () => {
    expect(
      runFrameworkProbe(`
      import assert from 'node:assert/strict';
      import { plugin_guard } from './node_modules/@sveltejs/kit/src/exports/vite/plugins/guard.js';
      const root = process.cwd();
      const page = root + '/src/routes/+page.svelte';
      const remote = root + '/src/lib/api/server/example.remote.ts';
      const server = root + '/src/lib/api/server/example.ts';
      async function createGuard(enabled) {
        const guard = plugin_guard({
          experimental: { remoteFunctions: enabled },
          files: { routes: 'src/routes', assets: 'static' }
        }, () => ({
          vite: { normalizePath: path => path }, root,
          normalized_aliases: [], service_worker_entry_file: null
        }), () => ({ nodes: [{ component: page }], hooks: {} }));
        guard.configResolved();
        for (const id of [remote, server]) {
          await guard.resolveId.handler.call({ resolve: async id => ({ id }) }, id, page, {});
        }
        return guard;
      }
      const enabled = await createGuard(true);
      assert.equal(enabled.load.handler(remote), undefined);
      assert.throws(() => enabled.load.handler(server), /server_only_import/);
      const disabled = await createGuard(false);
      assert.throws(() => disabled.load.handler(remote), /config_feature_disabled/);
      console.log('ok');
    `).trim(),
    ).toBe('ok')
  })

  it('returns query results and completes redirects without returning data', () => {
    expect(
      runFrameworkProbe(`
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      let source = readFileSync('./node_modules/@sveltejs/kit/src/runtime/client/remote-functions/query/index.js', 'utf8');
      source = source.replace(/^import .*;$/gm, '');
      const prelude = \`
        const DEV = false, base = '', app_dir = '_app', QUERY_FUNCTION_ID = Symbol();
        const query_map = new Map();
        const _goto = async value => globalThis.__queryProbeRedirects.push(value);
        const remote_request = async () => globalThis.__queryProbeResult;
        class QueryProxy { constructor(id, arg, fn) { return { run: () => fn(arg) }; } }
      \`;
      const { query } = await import('data:text/javascript;base64,' + Buffer.from(prelude + source).toString('base64'));
      globalThis.__queryProbeRedirects = [];
      globalThis.__queryProbeResult = { _: { value: 42 } };
      assert.deepEqual(await query('probe')('').run(), { value: 42 });
      globalThis.__queryProbeResult = { redirect: '/signin', _: 'must not return' };
      assert.equal(await query('probe')('').run(), undefined);
      assert.deepEqual(globalThis.__queryProbeRedirects, ['/signin']);
      console.log('ok');
    `).trim(),
    ).toBe('ok')
  })
})
