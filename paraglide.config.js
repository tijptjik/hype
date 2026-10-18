/** @type {import('@inlang/paraglide-js').ParaglideConfig} */
export default {
  // Share runtime settings between CLI tests and Vite to avoid rewriting live modules.
  strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
  cookieName: 'lang',
  isServer: "import.meta.env?.SSR ?? typeof window === 'undefined'",
}
