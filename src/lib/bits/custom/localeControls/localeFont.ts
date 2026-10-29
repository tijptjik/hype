// SELF-HOSTED SCRIPT FONTS
import '@fontsource/noto-sans-arabic/arabic-400.css'
import '@fontsource/noto-sans-hebrew/hebrew-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-bengali/bengali-400.css'
import '@fontsource/noto-sans-gurmukhi/gurmukhi-400.css'
import '@fontsource/noto-sans-tamil/tamil-400.css'
import '@fontsource/noto-sans-telugu/telugu-400.css'
import '@fontsource/noto-sans-thai/thai-400.css'
import '@fontsource/noto-sans-myanmar/myanmar-400.css'
import '@fontsource/noto-sans-khmer/khmer-400.css'
import '@fontsource/noto-sans-lao/lao-400.css'

/** Select a script-complete font for autonyms on systems without local font coverage.
 * @param tag Content-language code. @returns A self-hosted font family or system fallback.
 */
export function languageFont(tag: string): string {
  const scripts: Record<string, string> = {
    ar: 'Arabic',
    fa: 'Arabic',
    ur: 'Arabic',
    he: 'Hebrew',
    hi: 'Devanagari',
    ne: 'Devanagari',
    bn: 'Bengali',
    pa: 'Gurmukhi',
    ta: 'Tamil',
    te: 'Telugu',
    th: 'Thai',
    my: 'Myanmar',
    km: 'Khmer',
    lo: 'Lao',
  }
  const script = scripts[tag.split('-')[0]]
  return script ? `"Noto Sans ${script}", sans-serif` : 'sans-serif'
}
