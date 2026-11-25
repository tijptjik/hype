// TABLE OF CONTENTS
// 1. Bounded expression parser
// 2. Pure evaluation and dependency extraction
// 3. Editor insertion helpers

export type TemplateScalar = string | number | boolean | null | undefined
export type TemplateValues = Readonly<Record<string, TemplateScalar>>
export type TemplateExpression =
  | { kind: 'literal'; value: string }
  | { kind: 'property'; path: string }
  | { kind: 'sequence'; width: number; zeroPadded?: boolean }
  | { kind: 'fallback'; left: TemplateExpression; right: TemplateExpression }
  | {
      kind: 'call'
      name: 'pair' | 'join' | 'optional' | 'cases' | 'trilean' | 'ternary'
      args: TemplateExpression[]
    }
export type DisplayTemplate = {
  parts: (string | TemplateExpression)[]
  dependencies: string[]
  components: { start: number; end: number; expression: TemplateExpression }[]
}
const MAX_SOURCE = 4096
const MAX_NODES = 256
const MAX_DEPTH = 20
const MAX_OUTPUT = 8192
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])

/** Parse the deliberately small display language, never JavaScript.
 * @param source Locale-specific text with {{ expression }} tags.
 * @returns Validated syntax and all dependencies, including inactive cases.
 * @remarks Only flat, explicitly supplied property paths can be read. Parsing is bounded.
 */
export function parseDisplayTemplate(
  source: string,
  onLegacyName?: (start: number, end: number) => void,
): DisplayTemplate {
  if (source.length > MAX_SOURCE) throw new Error('Template exceeds 4096 characters')
  let position = 0
  let nodes = 0
  const dependencies = new Set<string>()
  const parts: DisplayTemplate['parts'] = []
  const components: DisplayTemplate['components'] = []
  const fail = (message: string): never => {
    throw new Error(`${message} at character ${position + 1}`)
  }
  const whitespace = (): void => {
    while (/\s/.test(source[position] ?? '') && position < source.length) position++
  }
  const atom = (depth: number): TemplateExpression => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('Template is too complex')
    whitespace()
    if (source[position] === '"') {
      const start = position++
      let escaped = false
      while (position < source.length) {
        const char = source[position++]
        if (char === '"' && !escaped) {
          try {
            return { kind: 'literal', value: JSON.parse(source.slice(start, position)) }
          } catch {
            return fail('Invalid quoted text')
          }
        }
        escaped = char === '\\' && !escaped
      }
      return fail('Unclosed quoted text')
    }
    // Named sequences retain their digit setting even when padding is disabled.
    const sequence = /^sequence\s*\(\s*(\d+)\s*,\s*(true|false)\s*\)/.exec(
      source.slice(position),
    )
    if (sequence) {
      const width = Number(sequence[1])
      if (width < 1 || width > 20)
        fail('Sequence width must be between 1 and 20 digits')
      position += sequence[0].length
      dependencies.add('session.sequence')
      return { kind: 'sequence', width, zeroPadded: sequence[2] === 'true' }
    }
    const zeros = /^0+(?![A-Za-z0-9_.-])/.exec(source.slice(position))
    if (zeros) {
      if (zeros[0].length > 20) fail('Sequence width exceeds 20 digits')
      position += zeros[0].length
      dependencies.add('session.sequence')
      return { kind: 'sequence', width: zeros[0].length }
    }
    const match = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(source.slice(position))
    if (!match) return fail('Expected a property, quoted text or function')
    const name = match[0]
    const nameStart = position
    position += name.length
    if (name.split('.').some(part => !part || forbidden.has(part)))
      fail('Invalid property path')
    whitespace()
    if (source[position] !== '(') {
      dependencies.add(name)
      return { kind: 'property', path: name }
    }
    if (
      name !== 'pair' &&
      name !== 'join' &&
      name !== 'optional' &&
      name !== 'cases' &&
      name !== 'trilean' &&
      name !== 'ternary'
    )
      return fail('Unknown function')
    position++
    const args: TemplateExpression[] = []
    whitespace()
    while (source[position] !== ')') {
      args.push(expression(depth + 1))
      whitespace()
      if (source[position] !== ',') break
      position++
    }
    if (source[position++] !== ')') fail('Expected closing parenthesis')
    if (name === 'cases') {
      // Four arguments retain the original true/false/missing syntax.
      if (args.length !== 4 && (args.length < 3 || args.length % 2 === 0))
        fail('cases requires a property followed by value and output pairs')
    } else {
      const count = name === 'trilean' || name === 'ternary' ? 4 : 3
      if (args.length !== count) fail(`${name} requires ${count} arguments`)
    }
    if ((name === 'cases' && args.length === 4) || name === 'trilean') {
      onLegacyName?.(nameStart, nameStart + name.length)
      return { kind: 'call', name: 'ternary', args }
    }
    return { kind: 'call', name, args }
  }
  const expression = (depth: number): TemplateExpression => {
    const left = atom(depth)
    whitespace()
    if (source.slice(position, position + 2) !== '??') return left
    position += 2
    return { kind: 'fallback', left, right: expression(depth + 1) }
  }
  // Read delimiters through the parser so quoted braces remain ordinary text.
  while (position < source.length) {
    const start = source.indexOf('{{', position)
    if (start < 0) {
      parts.push(source.slice(position))
      break
    }
    if (start > position) parts.push(source.slice(position, start))
    position = start + 2
    const node = expression(0)
    parts.push(node)
    whitespace()
    if (source.slice(position, position + 2) !== '}}') fail('Expected closing tag')
    position += 2
    components.push({ start, end: position, expression: node })
  }
  return { parts, dependencies: [...dependencies].sort(), components }
}

/** Convert legacy condition calls to ternary without changing text or other expressions.
 * @param source Existing template. @returns Equivalent template with current function names.
 * @remarks Invalid drafts are returned unchanged for the author to repair.
 */
export function migrateTemplateConditionals(source: string): string {
  const ranges: { start: number; end: number }[] = []
  try {
    parseDisplayTemplate(source, (start, end) => ranges.push({ start, end }))
  } catch {
    return source
  }
  return ranges
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, range) =>
        result.slice(0, range.start) + 'ternary' + result.slice(range.end),
      source,
    )
}

/** Distinguish absence from false and zero.
 * @param value Property value. @returns Whether a value can contribute display text.
 */
function present(value: TemplateScalar): boolean {
  return value != null && (typeof value !== 'string' || value.trim().length > 0)
}

/** Render one localized template using an accepted, already resolved value map.
 * @param source Validated source text. @param values Flat scalar properties, without live database access.
 * @param options Enable case-insensitive fallback for research option labels. Exact matches take precedence.
 * @returns Plain text; callers must render as text, never HTML.
 * @remarks pair requires both sides; optional adds prefix/suffix only when present;
 * join keeps either present side and inserts its separator only between two values;
 * ternary distinguishes false from missing; legacy four-argument cases does the same.
 * Other cases calls map exact string values and leave unmatched values unchanged.
 */
export function renderDisplayTemplate(
  source: string,
  values: TemplateValues,
  options: { ignoreCase?: boolean } = {},
): string {
  const parsed = parseDisplayTemplate(source)
  const evaluate = (node: TemplateExpression): TemplateScalar => {
    switch (node.kind) {
      case 'literal':
        return node.value
      case 'sequence': {
        const ordinal = Object.hasOwn(values, 'session.sequence')
          ? values['session.sequence']
          : undefined
        if (
          typeof ordinal !== 'number' ||
          !Number.isSafeInteger(ordinal) ||
          ordinal < 1
        )
          return undefined
        return String(ordinal).padStart(node.zeroPadded === false ? 1 : node.width, '0')
      }
      case 'property':
        return Object.hasOwn(values, node.path) ? values[node.path] : undefined
      case 'fallback': {
        const value = evaluate(node.left)
        return present(value) ? value : evaluate(node.right)
      }
      case 'call': {
        const first = evaluate(node.args[0])
        if (
          node.name === 'trilean' ||
          node.name === 'ternary' ||
          (node.name === 'cases' && node.args.length === 4)
        )
          return evaluate(node.args[!present(first) ? 3 : first === false ? 2 : 1])
        if (node.name === 'cases') {
          if (!present(first)) return undefined
          const input = String(first)
          const folded = options.ignoreCase ? input.toLowerCase() : undefined
          let match: TemplateExpression | undefined
          let ambiguous = false
          for (let index = 1; index < node.args.length; index += 2) {
            const key = String(evaluate(node.args[index]) ?? '')
            if (input === key) return evaluate(node.args[index + 1])
            if (folded !== undefined && folded === key.toLowerCase()) {
              if (match) ambiguous = true
              match = node.args[index + 1]
            }
          }
          return match && !ambiguous ? evaluate(match) : first
        }
        const second = evaluate(node.args[1])
        if (node.name === 'join')
          return [first, second]
            .filter(present)
            .join(String(evaluate(node.args[2]) ?? ''))
        if (!present(first)) return undefined
        if (node.name === 'pair')
          return present(second)
            ? `${first}${evaluate(node.args[2]) ?? ''}${second}`
            : undefined
        return `${second ?? ''}${first}${evaluate(node.args[2]) ?? ''}`
      }
    }
  }
  const result = parsed.parts
    .map(part => (typeof part === 'string' ? part : (evaluate(part) ?? '')))
    .join('')
  if (result.length > MAX_OUTPUT)
    throw new Error('Generated text exceeds 8192 characters')
  return result
}

/** Build a safe property tag for the small editor.
 * @param path Selected property. @returns Validated tag.
 */
export function templatePropertyTag(path: string): string {
  const tag = `{{ ${path} }}`
  const parsed = parseDisplayTemplate(tag)
  if (
    parsed.parts.length !== 1 ||
    typeof parsed.parts[0] === 'string' ||
    parsed.parts[0].kind !== 'property'
  )
    throw new Error('Select a property')
  return tag
}

/** Build a pair with a literal separator.
 * @param left First property. @param right Second property. @param separator Literal separator.
 * @returns Insertable pair expression.
 */
export function templatePairTag(
  left: string,
  right: string,
  separator = ' - ',
): string {
  templatePropertyTag(left)
  templatePropertyTag(right)
  return `{{ pair(${left}, ${right}, ${JSON.stringify(separator)}) }}`
}

/** Build distinct boolean/presence cases without interpreting user-entered text as code.
 * @param path Property. @param truthy Present/true text. @param falsy False text. @param missing Missing text.
 * @returns Insertable conditional expression.
 */
export function templateCasesTag(
  path: string,
  truthy: string,
  falsy: string,
  missing: string,
): string {
  templatePropertyTag(path)
  return templateTernaryTag(path, truthy, falsy, missing)
}

/** Build a three-state conditional without interpreting entered text as code.
 * @param path Property. @param truthy Present text. @param falsy False text. @param missing Missing text.
 * @returns Insertable conditional expression.
 */
export function templateTernaryTag(
  path: string,
  truthy: string,
  falsy: string,
  missing: string,
): string {
  templatePropertyTag(path)
  return `{{ ternary(${path}, ${JSON.stringify(truthy)}, ${JSON.stringify(falsy)}, ${JSON.stringify(missing)}) }}`
}
