// THIRD PARTY
import { prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext'

const DEFAULT_FONT = '15px Georgia, "Times New Roman", serif'
const SOFT_HYPHEN = '\u00AD'

const HYPHEN_EXCEPTIONS: Record<string, string[]> = {
  extensively: ['ex', 'ten', 'sive', 'ly'],
  relationship: ['re', 'la', 'tion', 'ship'],
  typographic: ['ty', 'po', 'graph', 'ic'],
  comfortable: ['com', 'fort', 'a', 'ble'],
  horizontal: ['hor', 'i', 'zon', 'tal'],
  vertically: ['ver', 'ti', 'cal', 'ly'],
  disrupting: ['dis', 'rupt', 'ing'],
  comprehension: ['com', 'pre', 'hen', 'sion'],
  traditional: ['tra', 'di', 'tion', 'al'],
  combination: ['com', 'bi', 'na', 'tion'],
  techniques: ['tech', 'niques'],
  hyphenation: ['hy', 'phen', 'a', 'tion'],
  dictionaries: ['dic', 'tion', 'ar', 'ies'],
  permitted: ['per', 'mit', 'ted'],
  syllable: ['syl', 'la', 'ble'],
  boundaries: ['bound', 'a', 'ries'],
  letterspacing: ['let', 'ter', 'spac', 'ing'],
  adjustments: ['ad', 'just', 'ments'],
  distributed: ['dis', 'trib', 'u', 'ted'],
  additional: ['ad', 'di', 'tion', 'al'],
  individual: ['in', 'di', 'vid', 'u', 'al'],
  characters: ['char', 'ac', 'ters'],
  significantly: ['sig', 'nif', 'i', 'cant', 'ly'],
  optimization: ['op', 'ti', 'mi', 'za', 'tion'],
  evaluated: ['e', 'val', 'u', 'at', 'ed'],
  thousands: ['thou', 'sands'],
  possible: ['pos', 'si', 'ble'],
  arrangement: ['ar', 'range', 'ment'],
  minimizing: ['min', 'i', 'miz', 'ing'],
  deviation: ['de', 'vi', 'a', 'tion'],
  paragraph: ['par', 'a', 'graph'],
  algorithm: ['al', 'go', 'rithm'],
  developed: ['de', 'vel', 'oped'],
  typesetting: ['type', 'set', 'ting'],
  constructs: ['con', 'structs'],
  feasible: ['fea', 'si', 'ble'],
  breakpoints: ['break', 'points'],
  produces: ['pro', 'du', 'ces'],
  uniform: ['u', 'ni', 'form'],
  throughout: ['through', 'out'],
  simplified: ['sim', 'pli', 'fied'],
  implementation: ['im', 'ple', 'men', 'ta', 'tion'],
  dramatically: ['dra', 'mat', 'i', 'cal', 'ly'],
  processors: ['proc', 'es', 'sors'],
  justification: ['jus', 'ti', 'fi', 'ca', 'tion'],
  operates: ['op', 'er', 'ates'],
  strictly: ['strict', 'ly'],
  distributes: ['dis', 'trib', 'utes'],
  remaining: ['re', 'main', 'ing'],
  uniformly: ['u', 'ni', 'form', 'ly'],
  requires: ['re', 'quires'],
  lookahead: ['look', 'a', 'head'],
  executes: ['ex', 'e', 'cutes'],
  quickly: ['quick', 'ly'],
  inconsistent: ['in', 'con', 'sis', 'tent'],
  particularly: ['par', 'tic', 'u', 'lar', 'ly'],
  enormous: ['e', 'nor', 'mous'],
  preceding: ['pre', 'ced', 'ing'],
  compositor: ['com', 'pos', 'i', 'tor'],
  twentieth: ['twen', 'ti', 'eth'],
  century: ['cen', 'tu', 'ry'],
}

const PREFIXES = [
  'anti',
  'auto',
  'be',
  'bi',
  'co',
  'com',
  'con',
  'contra',
  'counter',
  'de',
  'dis',
  'en',
  'em',
  'ex',
  'extra',
  'fore',
  'hyper',
  'il',
  'im',
  'in',
  'inter',
  'intra',
  'ir',
  'macro',
  'mal',
  'micro',
  'mid',
  'mis',
  'mono',
  'multi',
  'non',
  'omni',
  'out',
  'over',
  'para',
  'poly',
  'post',
  'pre',
  'pro',
  'pseudo',
  'quasi',
  're',
  'retro',
  'semi',
  'sub',
  'super',
  'sur',
  'syn',
  'tele',
  'trans',
  'tri',
  'ultra',
  'un',
  'under',
]

const SUFFIXES = [
  'able',
  'ible',
  'tion',
  'sion',
  'ment',
  'ness',
  'ous',
  'ious',
  'eous',
  'ful',
  'less',
  'ive',
  'ative',
  'itive',
  'al',
  'ial',
  'ical',
  'ing',
  'ling',
  'ed',
  'er',
  'est',
  'ism',
  'ist',
  'ity',
  'ety',
  'ty',
  'ence',
  'ance',
  'ly',
  'fy',
  'ify',
  'ize',
  'ise',
  'ure',
  'ture',
]

function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') {
    return text.length * 8
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return text.length * 8

  context.font = font
  return context.measureText(text).width
}

function hyphenateWord(word: string): string[] {
  const lower = word.toLowerCase().replace(/[.,;:!?"'""''—–-]/g, '')
  if (lower.length < 5) return [word]

  const exception = HYPHEN_EXCEPTIONS[lower]
  if (exception) {
    const parts: string[] = []
    let position = 0

    for (const part of exception) {
      parts.push(word.slice(position, position + part.length))
      position += part.length
    }

    if (position < word.length) {
      parts[parts.length - 1] += word.slice(position)
    }

    return parts.filter(Boolean)
  }

  for (const prefix of PREFIXES) {
    if (lower.startsWith(prefix) && lower.length - prefix.length >= 3) {
      return [word.slice(0, prefix.length), word.slice(prefix.length)]
    }
  }

  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
      const cut = word.length - suffix.length
      return [word.slice(0, cut), word.slice(cut)]
    }
  }

  return [word]
}

/**
 * Inserts soft hyphens using the demo algorithm so feature-card copy can opt
 * into the same breakpoint candidates as the justification experiment.
 *
 * @param input Plain paragraph text.
 * @returns Text with soft hyphen opportunities inserted.
 */
export function insertSoftHyphens(input: string): string {
  return input
    .split(/(\s+)/)
    .map(token => {
      if (/^\s+$/.test(token)) return token

      const parts = hyphenateWord(token)
      return parts.length <= 1 ? token : parts.join(SOFT_HYPHEN)
    })
    .join('')
}

/**
 * Prepares hyphenated text for later line-layout work.
 *
 * @param input Plain paragraph text.
 * @param font Canvas font shorthand.
 * @returns Pretext prepared segments with soft-hyphen opportunities included.
 */
export function prepareFeatureCardJustifiedText(
  input: string,
  font: string = DEFAULT_FONT,
): PreparedTextWithSegments {
  return prepareWithSegments(insertSoftHyphens(input), font, {
    whiteSpace: 'pre-wrap',
  })
}

/**
 * Computes optimal line breaks using the simplified Knuth-Plass dynamic
 * programming approach from the demo HTML.
 *
 * @param prepared Pretext prepared segments, ideally from `prepareFeatureCardJustifiedText`.
 * @param maxWidth Available line width in pixels.
 * @param font Canvas font shorthand used for spacing measurements.
 * @returns Lines expressed as measured text segments plus natural widths.
 */
export function computeOptimalJustifiedLines(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  font: string = DEFAULT_FONT,
): Array<{
  segments: Array<{ text: string; width: number; isSpace: boolean }>
  naturalWidth: number
  isLast: boolean
}> {
  const segments = prepared.segments
  const widths = prepared.widths
  const normalSpaceWidth = measureTextWidth(' ', font)
  const hyphenWidth = measureTextWidth('-', font)
  const candidateBreaks: Array<{ segmentIndex: number; isSoftHyphen: boolean }> = [
    { segmentIndex: 0, isSoftHyphen: false },
  ]

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (segment === SOFT_HYPHEN && index + 1 < segments.length) {
      candidateBreaks.push({ segmentIndex: index + 1, isSoftHyphen: true })
      continue
    }

    if (segment.trim().length === 0 && index + 1 < segments.length) {
      candidateBreaks.push({ segmentIndex: index + 1, isSoftHyphen: false })
    }
  }

  candidateBreaks.push({
    segmentIndex: segments.length,
    isSoftHyphen: false,
  })

  function getLineInfo(
    fromIndex: number,
    toIndex: number,
  ): {
    wordWidth: number
    spaceCount: number
    endsWithHyphen: boolean
  } {
    const from = candidateBreaks[fromIndex]?.segmentIndex ?? 0
    const to = candidateBreaks[toIndex]?.segmentIndex ?? segments.length
    const endsWithHyphen = candidateBreaks[toIndex]?.isSoftHyphen ?? false
    let wordWidth = 0
    let spaceCount = 0

    for (let segmentIndex = from; segmentIndex < to; segmentIndex += 1) {
      const segment = segments[segmentIndex] ?? ''
      if (segment === SOFT_HYPHEN) continue
      if (segment.trim().length === 0) {
        spaceCount += 1
        continue
      }

      wordWidth += widths[segmentIndex] ?? 0
    }

    if (to > from && (segments[to - 1] ?? '').trim().length === 0) {
      spaceCount -= 1
    }

    if (endsWithHyphen) {
      wordWidth += hyphenWidth
    }

    return { wordWidth, spaceCount, endsWithHyphen }
  }

  function getLineBadness(
    lineInfo: { wordWidth: number; spaceCount: number; endsWithHyphen: boolean },
    isLastLine: boolean,
  ): number {
    if (isLastLine) {
      return lineInfo.wordWidth > maxWidth ? 1e8 : 0
    }

    if (lineInfo.spaceCount <= 0) {
      const slack = maxWidth - lineInfo.wordWidth
      return slack < 0 ? 1e8 : slack * slack * 10
    }

    const justifiedSpace = (maxWidth - lineInfo.wordWidth) / lineInfo.spaceCount
    if (justifiedSpace < 0 || justifiedSpace < normalSpaceWidth * 0.4) {
      return 1e8
    }

    const ratio = (justifiedSpace - normalSpaceWidth) / normalSpaceWidth
    const baseBadness = Math.abs(ratio) ** 3 * 1000
    const riverExcess = justifiedSpace / normalSpaceWidth - 1.5
    const riverPenalty = riverExcess > 0 ? 5000 + riverExcess * riverExcess * 10000 : 0
    const tightThreshold = normalSpaceWidth * 0.65
    const tightPenalty =
      justifiedSpace < tightThreshold
        ? 3000 + (tightThreshold - justifiedSpace) ** 2 * 10000
        : 0
    const hyphenPenalty = lineInfo.endsWithHyphen ? 50 : 0

    return baseBadness + riverPenalty + tightPenalty + hyphenPenalty
  }

  const dp = new Array(candidateBreaks.length).fill(Number.POSITIVE_INFINITY)
  const previous = new Array(candidateBreaks.length).fill(-1)
  dp[0] = 0

  for (let toIndex = 1; toIndex < candidateBreaks.length; toIndex += 1) {
    const isLastLine = toIndex === candidateBreaks.length - 1

    for (let fromIndex = toIndex - 1; fromIndex >= 0; fromIndex -= 1) {
      if (!Number.isFinite(dp[fromIndex])) continue

      const lineInfo = getLineInfo(fromIndex, toIndex)
      const totalWidth = lineInfo.wordWidth + lineInfo.spaceCount * normalSpaceWidth

      if (totalWidth > maxWidth * 2) break

      const candidateCost = dp[fromIndex] + getLineBadness(lineInfo, isLastLine)
      if (candidateCost < dp[toIndex]) {
        dp[toIndex] = candidateCost
        previous[toIndex] = fromIndex
      }
    }
  }

  const breakIndices: number[] = []
  let cursor = candidateBreaks.length - 1

  while (cursor > 0) {
    if (previous[cursor] === -1) {
      cursor -= 1
      continue
    }

    breakIndices.push(cursor)
    cursor = previous[cursor]
  }

  breakIndices.reverse()

  const lines: Array<{
    segments: Array<{ text: string; width: number; isSpace: boolean }>
    naturalWidth: number
    isLast: boolean
  }> = []
  let fromCandidate = 0

  for (const breakIndex of breakIndices) {
    const from = candidateBreaks[fromCandidate]?.segmentIndex ?? 0
    const to = candidateBreaks[breakIndex]?.segmentIndex ?? segments.length
    const endsWithHyphen = candidateBreaks[breakIndex]?.isSoftHyphen ?? false
    const lineSegments: Array<{ text: string; width: number; isSpace: boolean }> = []

    for (let segmentIndex = from; segmentIndex < to; segmentIndex += 1) {
      const segment = segments[segmentIndex] ?? ''
      if (segment === SOFT_HYPHEN) continue

      lineSegments.push({
        text: segment,
        width: widths[segmentIndex] ?? 0,
        isSpace: segment.trim().length === 0,
      })
    }

    if (endsWithHyphen) {
      lineSegments.push({
        text: '-',
        width: hyphenWidth,
        isSpace: false,
      })
    }

    while (lineSegments.length > 0 && lineSegments.at(-1)?.isSpace) {
      lineSegments.pop()
    }

    lines.push({
      segments: lineSegments,
      naturalWidth: lineSegments.reduce((total, segment) => total + segment.width, 0),
      isLast: breakIndex === candidateBreaks.length - 1,
    })

    fromCandidate = breakIndex
  }

  return lines
}
