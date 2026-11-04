/** Telegram V3 media negotiation ↔ browser SDP.
 * Telegram's answers retain the OFFERER's SSRCs; each party offers its own
 * send-only channels independently. Wire contract: tgcalls ContentNegotiation.cpp
 * at ea5153e7184649feccf84d6735c9029ae9e78e8d. No Telegram Web code is used.
 */
export interface MediaContent {
  type: 'audio' | 'video'
  ssrc: string
  ssrcGroups: { semantics: string; ssrcs: string[] }[]
  payloadTypes: {
    id: number
    name: string
    clockrate: number
    channels?: number
    parameters: Record<string, string>
    feedbackTypes: { type: string; subtype: string }[]
  }[]
  rtpExtensions: { id: number; uri: string }[]
}
export interface InitialSetup {
  '@type': 'InitialSetup'
  ufrag: string
  pwd: string
  renomination: boolean
  fingerprints: { hash: string; fingerprint: string; setup: string }[]
}
export interface Negotiation {
  '@type': 'NegotiateChannels'
  exchangeId: string
  contents: MediaContent[]
}
export type Signal =
  | InitialSetup
  | Negotiation
  | { '@type': 'Candidates'; candidates: { sdpString: string }[] }
  | {
      '@type': 'MediaState'
      muted: boolean
      videoState: string
      screencastState: string
      videoRotation: number
      lowBattery: boolean
    }
interface Section {
  mid: string
  type: 'audio' | 'video'
  direction: string
  content: MediaContent
}

/** @param value Untrusted JSON object. @returns A bounded object or a validation error. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Telegram media fields')
  return value as Record<string, unknown>
}
/** @param value Untrusted list. @param max Element limit. @returns The bounded list. */
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error('Invalid Telegram media list')
  return value
}
/** @param value Untrusted field. @param pattern Allowed syntax. @param max Length limit. @returns Validated text safe for SDP. */
function field(value: unknown, pattern: RegExp, max = 256): string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > max ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in provider SDP fields.
    /[\r\n\x00-\x1f\x7f]/.test(value) ||
    !pattern.test(value)
  )
    throw new Error('Invalid Telegram media field')
  return value
}
/** @param value Numeric field. @param max Upper bound. @param min Lower bound. @returns Validated integer. */
function integer(value: unknown, max: number, min = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error('Invalid Telegram media number')
  return value
}
/** @param value Wire SSRC. @returns Decimal nonzero 32-bit SSRC. */
function ssrc(value: unknown): string {
  const text = field(value, /^\d{1,10}$/)
  integer(Number(text), 0xffffffff, 1)
  return text
}
/** @param value Untrusted media content. @returns Validated codec and channel fields. */
function content(value: unknown): MediaContent {
  const c = record(value)
  if (c.type !== 'audio' && c.type !== 'video')
    throw new Error('Unsupported Telegram media type')
  const payloadTypes = list(c.payloadTypes, 32).map(value => {
    const p = record(value),
      parameters: Record<string, string> = Object.create(null)
    for (const [key, val] of Object.entries(record(p.parameters ?? {}))) {
      if (Object.keys(parameters).length >= 32)
        throw new Error('Too many codec parameters')
      parameters[field(key, /^[a-zA-Z0-9_.-]+$/, 64)] = field(
        val,
        /^[a-zA-Z0-9_.+/,= -]+$/,
        256,
      )
    }
    // Native tgcalls explicitly writes zero channels for video codecs. Zero is
    // a wire sentinel, not an SDP channel suffix; audio still requires 1–8.
    const channels =
      p.channels === undefined
        ? undefined
        : integer(p.channels, c.type === 'video' ? 0 : 8, c.type === 'video' ? 0 : 1)
    return {
      id: integer(p.id, 127),
      name: field(p.name, /^[a-zA-Z0-9_-]+$/, 32),
      clockrate: integer(p.clockrate, 192000, 1),
      ...(channels ? { channels } : {}),
      parameters,
      feedbackTypes: list(p.feedbackTypes ?? [], 16).map(value => {
        const f = record(value)
        return {
          type: field(f.type, /^[a-zA-Z0-9_-]+$/, 32),
          subtype:
            f.subtype === '' || f.subtype === undefined
              ? ''
              : field(f.subtype, /^[a-zA-Z0-9_-]+$/, 32),
        }
      }),
    }
  })
  if (
    !payloadTypes.length ||
    new Set(payloadTypes.map(p => p.id)).size !== payloadTypes.length
  )
    throw new Error('Invalid Telegram payload identifiers')
  const rtpExtensions = list(c.rtpExtensions ?? [], 16).map(value => {
    const e = record(value)
    return {
      id: integer(e.id, 255, 1),
      uri: field(e.uri, /^(?:urn:|https?:\/\/)[^\s]+$/, 256),
    }
  })
  if (new Set(rtpExtensions.map(e => e.id)).size !== rtpExtensions.length)
    throw new Error('Duplicate RTP extension')
  return {
    type: c.type,
    ssrc: ssrc(c.ssrc),
    payloadTypes,
    rtpExtensions,
    ssrcGroups: list(c.ssrcGroups ?? [], 8).map(value => {
      const g = record(value)
      return {
        semantics: field(g.semantics, /^(FID|FEC|FEC-FR|SIM)$/, 8),
        ssrcs: list(g.ssrcs, 4).map(ssrc),
      }
    }),
  }
}

/** Validate authenticated peer fields before any SDP interpolation.
 * @param value Decrypted signalling envelope. @returns A bounded, normalized message.
 */
export function parseSignal(value: unknown): Signal {
  const m = record(value)
  switch (m['@type']) {
    case 'InitialSetup': {
      const fingerprints = list(m.fingerprints, 4).map(value => {
        const f = record(value)
        return {
          hash: field(f.hash, /^sha-256$/),
          fingerprint: field(f.fingerprint, /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/),
          setup: field(f.setup, /^(actpass|active|passive)$/),
        }
      })
      if (!fingerprints.length)
        throw new Error('Missing authenticated DTLS fingerprint')
      return {
        '@type': 'InitialSetup',
        ufrag: field(m.ufrag, /^[a-zA-Z0-9+/]{4,256}$/),
        pwd: field(m.pwd, /^[a-zA-Z0-9+/]{22,256}$/),
        renomination: m.renomination === true,
        fingerprints,
      }
    }
    case 'NegotiateChannels': {
      const contents = list(m.contents, 2).map(content)
      if (
        new Set(contents.map(c => c.ssrc)).size !== contents.length ||
        new Set(contents.map(c => c.type)).size !== contents.length
      )
        throw new Error('Duplicate Telegram channel')
      return {
        '@type': 'NegotiateChannels',
        exchangeId: field(m.exchangeId, /^\d{1,20}$/),
        contents,
      }
    }
    case 'Candidates':
      return {
        '@type': 'Candidates',
        candidates: list(m.candidates, 32).map(value => ({
          sdpString: field(
            record(value).sdpString,
            /^(?:a=)?candidate:[\x20-\x7e]+$/,
            2048,
          ),
        })),
      }
    case 'MediaState':
      return {
        '@type': 'MediaState',
        muted: m.muted === true,
        lowBattery: m.lowBattery === true,
        videoState: field(m.videoState, /^(inactive|active|suspended)$/),
        screencastState: field(m.screencastState, /^(inactive|active|suspended)$/),
        videoRotation: integer(m.videoRotation ?? 0, 270),
      }
    default:
      throw new Error('Unknown Telegram media message')
  }
}

/** Parse our own browser's SDP; remote strings never enter this parser.
 * @param sdp Local browser session description. @returns Media sections in browser order.
 */
function sections(sdp: string): Section[] {
  return sdp
    .split(/\r?\nm=/)
    .slice(1)
    .map(block => {
      const lines = block.split(/\r?\n/),
        type = lines[0].split(' ')[0]
      if (type !== 'audio' && type !== 'video')
        throw new Error('Unexpected local media section')
      const attr = (name: string): string =>
        lines.find(line => line.startsWith(`a=${name}:`))?.slice(name.length + 3) ?? ''
      const payloadTypes = lines
        .filter(l => l.startsWith('a=rtpmap:'))
        .map(line => {
          const [id, format] = line.slice(9).split(' '),
            [name, rate, channels] = format.split('/')
          const params =
            lines
              .find(l => l.startsWith(`a=fmtp:${id} `))
              ?.split(' ')
              .slice(1)
              .join(' ') ?? ''
          return {
            id: Number(id),
            name,
            clockrate: Number(rate),
            ...(channels ? { channels: Number(channels) } : {}),
            parameters: Object.fromEntries(
              params
                .split(';')
                .filter(Boolean)
                .map(p => {
                  const i = p.indexOf('=')
                  return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
                }),
            ),
            feedbackTypes: lines
              .filter(l => l.startsWith(`a=rtcp-fb:${id} `))
              .map(l => {
                const [type, ...subtype] = l.split(' ').slice(1)
                return { type, subtype: subtype.join(' ') }
              }),
          }
        })
      const groups = lines
        .filter(l => l.startsWith('a=ssrc-group:'))
        .map(l => {
          const [semantics, ...ssrcs] = l.slice(13).split(' ')
          return { semantics, ssrcs }
        })
      return {
        mid: attr('mid'),
        type,
        direction:
          lines
            .find(l => /^a=(sendonly|recvonly|sendrecv|inactive)$/.test(l))
            ?.slice(2) ?? 'sendrecv',
        content: {
          type,
          ssrc: attr('ssrc').split(' ')[0] || '0',
          ssrcGroups: groups,
          payloadTypes,
          rtpExtensions: lines
            .filter(l => l.startsWith('a=extmap:'))
            .map(l => {
              const [id, uri] = l.slice(9).split(' ')
              return { id: Number(id.split('/')[0]), uri }
            }),
        },
      }
    })
}

/** @param sdp Local SDP. @returns Public ICE and DTLS parameters for authenticated signalling. */
export function localSetup(sdp: string): InitialSetup {
  const attr = (name: string): string =>
    sdp
      .split(/\r?\n/)
      .find(l => l.startsWith(`a=${name}:`))
      ?.slice(name.length + 3) ?? ''
  const [hash, fingerprint] = attr('fingerprint').split(' ')
  return parseSignal({
    '@type': 'InitialSetup',
    ufrag: attr('ice-ufrag'),
    pwd: attr('ice-pwd'),
    fingerprints: [{ hash, fingerprint, setup: attr('setup') }],
  }) as InitialSetup
}

/** @param sdp Browser offer. @returns Only locally sent channels, matching Telegram's send-only contract. */
export function localContents(sdp: string): MediaContent[] {
  return sections(sdp)
    .filter(s => s.direction === 'sendonly' && s.content.ssrc !== '0')
    .map(s => content(s.content))
}

/** Maintains stable browser m-lines while Telegram negotiates independent send directions. */
export class TelegramNegotiation {
  private remote = new Map<string, MediaContent>()
  private version = 0
  private nextMid = 100
  private offered: Section[] = []

  /** @param sdp Browser's pending offer. @returns Outgoing channel descriptors. */
  offer(sdp: string): MediaContent[] {
    this.offered = sections(sdp)
    return localContents(sdp)
  }

  /** @param setup Authenticated remote transport. @param message Peer offer/answer. @param local Latest local SDP. @param answer Whether this answers our pending offer. @param outgoing Caller role, fixes DTLS role across renegotiations. @returns Browser-ready remote SDP. */
  description(
    setup: InitialSetup,
    message: Negotiation,
    local: string,
    answer: boolean,
    outgoing: boolean,
  ): string {
    if (++this.version > 32) throw new Error('Too many Telegram negotiations')
    const localSections = answer ? this.offered : sections(local)
    const remoteSsrcs = new Set(message.contents.map(c => c.ssrc))
    if (
      answer &&
      message.contents.some(
        c =>
          !localSections.some(
            s =>
              s.direction === 'sendonly' &&
              s.content.ssrc === c.ssrc &&
              s.type === c.type,
          ),
      )
    )
      throw new Error('Telegram answered an unknown channel')
    const rows: Section[] = localSections.map(s => {
      if (s.direction === 'sendonly') {
        const accepted = answer
          ? message.contents.find(c => c.ssrc === s.content.ssrc)
          : s.content
        return {
          ...s,
          direction: accepted ? 'recvonly' : 'inactive',
          content: accepted ?? s.content,
        }
      }
      const previous = this.remote.get(s.mid)
      const incoming = answer
        ? previous
        : message.contents.find(c => c.ssrc === previous?.ssrc)
      if (incoming) this.remote.set(s.mid, incoming)
      else this.remote.delete(s.mid)
      return {
        ...s,
        direction: incoming ? 'sendonly' : 'inactive',
        content: incoming ?? s.content,
      }
    })
    if (!answer)
      for (const c of message.contents) {
        if (rows.some(s => s.direction === 'sendonly' && s.content.ssrc === c.ssrc))
          continue
        if (
          localSections.some(
            s => s.direction === 'sendonly' && s.content.ssrc === c.ssrc,
          )
        )
          throw new Error('Reflected Telegram channel')
        const mid = String(this.nextMid++)
        this.remote.set(mid, c)
        rows.push({ mid, type: c.type, direction: 'sendonly', content: c })
      }
    if (!rows.length || rows.length > 8 || remoteSsrcs.size !== message.contents.length)
      throw new Error('Invalid Telegram channel negotiation')
    const f = setup.fingerprints[0]
    // Offers always allow role negotiation; answers select the stable call role.
    const role = answer ? (outgoing ? 'passive' : 'active') : 'actpass'
    return [
      'v=0',
      `o=- 1 ${this.version} IN IP4 0.0.0.0`,
      's=-',
      't=0 0',
      `a=group:BUNDLE ${rows.map(s => s.mid).join(' ')}`,
      'a=msid-semantic: WMS *',
      ...rows.flatMap(s => {
        const c = s.content
        return [
          `m=${s.type} 9 UDP/TLS/RTP/SAVPF ${c.payloadTypes.map(p => p.id).join(' ')}`,
          'c=IN IP4 0.0.0.0',
          `a=mid:${s.mid}`,
          `a=${s.direction}`,
          'a=rtcp-mux',
          'a=rtcp-rsize',
          `a=ice-ufrag:${setup.ufrag}`,
          `a=ice-pwd:${setup.pwd}`,
          'a=ice-options:trickle',
          `a=fingerprint:${f.hash} ${f.fingerprint}`,
          `a=setup:${role}`,
          ...c.payloadTypes.flatMap(p => [
            `a=rtpmap:${p.id} ${p.name}/${p.clockrate}${p.channels ? `/${p.channels}` : ''}`,
            ...(Object.keys(p.parameters).length
              ? [
                  `a=fmtp:${p.id} ${Object.entries(p.parameters)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(';')}`,
                ]
              : []),
            ...p.feedbackTypes.map(
              fb => `a=rtcp-fb:${p.id} ${fb.type}${fb.subtype ? ` ${fb.subtype}` : ''}`,
            ),
          ]),
          ...c.rtpExtensions.map(e => `a=extmap:${e.id} ${e.uri}`),
          ...(s.direction === 'sendonly'
            ? [
                `a=msid:telegram ${s.type}-${c.ssrc}`,
                ...[
                  ...new Set([c.ssrc, ...c.ssrcGroups.flatMap(g => g.ssrcs)]),
                ].flatMap(id => [
                  `a=ssrc:${id} cname:telegram`,
                  `a=ssrc:${id} msid:telegram ${s.type}-${c.ssrc}`,
                ]),
                ...c.ssrcGroups.map(
                  g => `a=ssrc-group:${g.semantics} ${g.ssrcs.join(' ')}`,
                ),
              ]
            : []),
        ]
      }),
      '',
    ].join('\r\n')
  }

  /** Answer descriptors retain the peer's SSRCs and the browser's selected codecs.
   * @param sdp Browser answer. @param offer Remote offer. @returns Telegram's corresponding answer contents.
   */
  answer(sdp: string, offer: Negotiation): MediaContent[] {
    return sections(sdp)
      .filter(s => s.direction === 'recvonly')
      .flatMap(s => {
        const remote = this.remote.get(s.mid)
        return remote && offer.contents.some(c => c.ssrc === remote.ssrc)
          ? [{ ...s.content, ssrc: remote.ssrc, ssrcGroups: remote.ssrcGroups }]
          : []
      })
  }
}
