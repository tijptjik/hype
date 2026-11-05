// CONTENT LOCALES
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'

export type ContentTranslationResult =
  | { status: 'translated'; text: string; source: string; target: string }
  | { status: 'unsupported'; source: string; target: string; message: string }
  | { status: 'error'; source: string; target: string; message: string }

/** Provider failure retaining unsupported-pair identity for field-level callers. */
export class TranslationProviderError extends Error {
  constructor(
    message: string,
    readonly unsupported = false,
  ) {
    super(message)
  }
}

/**
 * Translates text using Azure Cognitive Services Translator.
 * @param texts Texts to translate, in response order.
 * @param sourceLocale Source content tag or legacy form alias.
 * @param targetLocale Target content tag or legacy form alias.
 * @param region Azure region.
 * @param apiKey Azure translation key.
 * @returns Translated texts in input order.
 * @remarks Unsupported pairs throw a typed error. This adapter never mutates form state.
 */
export async function translateText(
  texts: string[],
  sourceLocale: string,
  targetLocale: string,
  region: string,
  apiKey: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    'api-version': '3.0',
    ...localeToApiLanguageTag(sourceLocale, targetLocale),
  })
  let response: Response
  try {
    response = await fetch(
      `https://api.cognitive.microsofttranslator.com/translate?${params}`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Ocp-Apim-Subscription-Region': region,
          'Content-type': 'application/json',
          'X-ClientTraceId': crypto.randomUUID(),
        },
        body: JSON.stringify(texts.map(text => ({ text }))),
        signal: AbortSignal.timeout(30_000),
      },
    )
  } catch {
    throw new TranslationProviderError('Translation service unavailable')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    // Azure reports unsupported source/target combinations separately from service errors.
    const code = Number(data?.error?.code)
    const unsupported = [400035, 400036].includes(code)
    throw new TranslationProviderError(
      unsupported
        ? 'Unsupported translation language pair'
        : 'Translation service unavailable',
      unsupported,
    )
  }
  if (
    !Array.isArray(data) ||
    data.length !== texts.length ||
    data.some(item => typeof item?.translations?.[0]?.text !== 'string')
  )
    throw new TranslationProviderError('Invalid translation response')
  return data.map(item => item.translations[0].text)
}

/** Convert locale to API language tag.
 * @param source Source content locale. @param target Target content locale.
 * @returns Azure language identifiers.
 * @remarks Preserve the established Traditional Chinese to Cantonese provider policy.
 */
function localeToApiLanguageTag(
  source: string,
  target: string,
): { from: string; to: string } {
  const azureTag = (value: string): string => {
    const canonical = canonicalContentTag(value)
    return canonical === 'zh-Hant' ? 'yue' : canonical
  }
  return { from: azureTag(source), to: azureTag(target) }
}

/** Split a field at paragraph, line or word boundaries within the provider budget.
 * @param text Original field text, including formatting whitespace.
 * @returns Ordered chunks whose concatenation exactly reproduces the input.
 * @remarks Unbroken text is split without separating UTF-16 surrogate pairs.
 */
function splitTranslationText(text: string): string[] {
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 5_000) {
    const window = remaining.slice(0, 5_000)
    let boundary = window.lastIndexOf('\n\n')
    if (boundary < 1) boundary = window.lastIndexOf('\n')
    if (boundary < 1) boundary = window.search(/\s+\S*$/u)
    if (boundary < 1) {
      boundary = 5_000
      const last = remaining.charCodeAt(boundary - 1)
      if (last >= 0xd800 && last <= 0xdbff) boundary -= 1
    }
    chunks.push(remaining.slice(0, boundary))
    remaining = remaining.slice(boundary)
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

/** Translate one field from one tag to another with explicit per-target outcomes.
 * @param input Immutable text and source/target tags.
 * @param region Azure region. @param apiKey Azure translation key.
 * @returns Success, unsupported-pair, or provider-error result; no form mutation.
 * @remarks Chunks share one bounded provider batch; no partial translation is returned.
 */
export async function translateContentField(
  input: { text: string; source: string; target: string },
  region: string,
  apiKey: string,
): Promise<ContentTranslationResult> {
  const source = canonicalContentTag(input.source)
  const target = canonicalContentTag(input.target)
  try {
    if (!input.text.trim()) throw new TranslationProviderError('Empty translation input')
    // Keep chunk-boundary whitespace outside the provider so paragraphs survive reassembly.
    const chunks = splitTranslationText(input.text).map(chunk => ({
      prefix: chunk.match(/^\s*/u)?.[0] ?? '',
      text: chunk.trim(),
      suffix: chunk.trim() ? chunk.match(/\s*$/u)?.[0] ?? '' : '',
    }))
    const translated = await translateText(
      chunks.filter(chunk => chunk.text).map(chunk => chunk.text),
      source, target, region, apiKey,
    )
    if (translated.some(text => !text.trim()))
      throw new TranslationProviderError('Empty translation response')
    let index = 0
    const text = chunks.map(chunk =>
      chunk.prefix + (chunk.text ? translated[index++].trim() : '') + chunk.suffix,
    ).join('')
    if (!text.trim()) throw new TranslationProviderError('Empty translation response')
    return { status: 'translated', text, source, target }
  } catch (error) {
    return {
      status:
        error instanceof TranslationProviderError && error.unsupported
          ? 'unsupported'
          : 'error',
      source,
      target,
      message:
        error instanceof TranslationProviderError
          ? error.message
          : 'Translation service unavailable',
    }
  }
}
