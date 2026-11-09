/**
 * Isolate explicitly ported browser-check servers from the main Vite process.
 * @param argv CLI arguments passed to Vite.
 * @param command Vite command; builds and sync retain the canonical output.
 * @returns SvelteKit output directory and an optional watcher exclusion.
 * @remarks Both generated manifests and optimized dependencies are process-owned.
 */
export function getDevOutput(
  argv: string[],
  command: string,
): {
  outDir: string
  ignored: RegExp[]
} {
  const index = argv.indexOf('--port')
  const value =
    index >= 0 ? argv[index + 1] : argv.find(arg => arg.startsWith('--port='))?.slice(7)
  const port = Number(value)
  if (
    command !== 'serve' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    port === 5175
  ) {
    return { outDir: '.svelte-kit', ignored: [] }
  }
  const directory = `dev-${port}`
  return {
    outDir: `.svelte-kit/${directory}`,
    // Ignore other servers' output while retaining this server's generated modules.
    ignored: [new RegExp(`[/\\\\]\\.svelte-kit[/\\\\](?!${directory}(?:[/\\\\]|$))`)],
  }
}

/**
 * Separates live translations from CLI compilation and other Vite processes.
 * @param argv CLI arguments passed to Vite, including an optional check-server port.
 * @param command Vite command, separating development output from build output.
 * @returns The process-owned directory for generated Paraglide modules.
 * @remarks CLI tests retain `src/lib/paraglide`; builds may use a different layout.
 */
export function getParaglideOutput(argv: string[], command: string): string {
  return `${getDevOutput(argv, command).outDir}/paraglide-${command === 'serve' ? 'dev' : 'build'}`
}
