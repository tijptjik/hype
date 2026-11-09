import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { getDevOutput, getParaglideOutput } from './output'

test('keeps generated translations isolated by server port', () => {
  expect(getParaglideOutput(['--port', '5175'], 'serve')).toBe(
    '.svelte-kit/generated/paraglide-dev',
  )
  expect(getParaglideOutput(['--port', '4173'], 'serve')).toBe(
    '.svelte-kit/dev-4173/generated/paraglide-dev',
  )
  expect(getParaglideOutput([], 'build')).toBe('.svelte-kit/generated/paraglide-build')
})

test('invalidates cached client and SSR translations with SvelteKit watcher exclusions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hype-translation-watch-'))
  const outDir = join(root, getDevOutput([], 'serve').outDir)
  const output = getParaglideOutput([], 'serve')
  const directory = join(root, output)
  const file = join(directory, 'messages.js')
  await mkdir(directory, { recursive: true })
  await writeFile(file, 'export const existing = () => "before"\n')
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
      watch: {
        // Match SvelteKit's exclusions: only generated output is watched.
        ignored: [`${outDir}/!(generated)`, `${outDir}/!(generated)/**`],
      },
    },
  })
  const ready = new Promise<void>(resolve => server.watcher.on('ready', resolve))
  try {
    await server.listen()
    await ready
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') throw new Error('Missing test port')
    const url = `http://127.0.0.1:${address.port}/${output}/messages.js`
    expect(await (await fetch(url)).text()).toContain('existing')
    expect((await server.ssrLoadModule(file)).existing()).toBe('before')
    // Add a new export after both module graphs have cached the old translation set.
    await writeFile(
      file,
      'export const existing = () => "after"\nexport const added = () => "available"\n',
    )
    const deadline = Date.now() + 5000
    while (!(await (await fetch(url)).text()).includes('export const added')) {
      if (Date.now() >= deadline) throw new Error('Translation transform stayed stale')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const messages = await server.ssrLoadModule(file)
    expect(messages.added()).toBe('available')
    expect(messages.existing()).toBe('after')
  } finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 15000)
