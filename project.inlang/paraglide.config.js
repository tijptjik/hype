/** @type {import('@inlang/paraglide-js').ParaglideConfig} */
export default {
  // Share runtime settings between CLI tests and Vite to avoid rewriting live modules.
  // Preserve the effective v2 defaults: the former repository-root config was not loaded.
  strategy: ['cookie', 'globalVariable', 'baseLocale'],
  cookieName: 'PARAGLIDE_LOCALE',
  isServer: "typeof window === 'undefined'",
  // V3 enables declarations in the CLI; keep Vite output consistent with it.
  emitTsDeclarations: true,
}
