/** Synthetic native-format descriptors, not an account capture.
 * Native field conventions: TelegramMessenger/tgcalls Signaling.cpp,
 * revision ea5153e7184649feccf84d6735c9029ae9e78e8d,
 * PayloadType_serialize and convertContentInfoToSignalingContent.
 */
export const nativeVideoOffer = {
  '@type': 'NegotiateChannels', exchangeId: '34567', contents: [{
    type: 'video', ssrc: '23456', ssrcGroups: [{ semantics: 'FID', ssrcs: ['23456', '23457'] }],
    payloadTypes: [
      { id: 100, name: 'VP8', clockrate: 90000, channels: 0, parameters: {}, feedbackTypes: [
        { type: 'goog-remb', subtype: '' }, { type: 'transport-cc', subtype: '' },
        { type: 'ccm', subtype: 'fir' }, { type: 'nack', subtype: '' }, { type: 'nack', subtype: 'pli' },
      ] },
      { id: 101, name: 'rtx', clockrate: 90000, channels: 0, parameters: { apt: '100' }, feedbackTypes: [] },
    ],
    rtpExtensions: [
      { id: 2, uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time' },
      { id: 3, uri: 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01' },
      { id: 13, uri: 'urn:3gpp:video-orientation' },
    ],
  }],
}
