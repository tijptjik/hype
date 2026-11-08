// SVELTE
import { onMount } from 'svelte'
// MEDIA
import { BrowserVoiceAudio } from './voiceAudio.js'
// TYPES
import type { WhatsAppMicrophoneModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'

/** Own input selection and a short local check, without issuing a call or voice ticket.
 * @returns Per-view microphone state; device IDs never leave the browser.
 */
export function createMicrophoneModel(): WhatsAppMicrophoneModel {
  let selected = $state('default')
  let inputs = $state<{ value: string; label: string }[]>([])
  let testing = $state(false)
  let level = $state(0)
  let status = $state('')
  let error = $state('')
  let active = false
  let revision = 0
  let audio: BrowserVoiceAudio | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let heardSound = false
  const devices = $derived([
    { value: 'default', label: 'System default microphone' },
    ...inputs,
    ...(selected !== 'default' && !inputs.some(input => input.value === selected)
      ? [{ value: selected, label: 'Selected microphone (disconnected)' }]
      : []),
  ])

  /** Refresh device labels without requesting capture or changing the selected input. */
  async function refresh(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      if (active)
        inputs = devices
          .filter(
            device =>
              device.kind === 'audioinput' &&
              device.deviceId &&
              !['default', 'communications'].includes(device.deviceId),
          )
          .map((device, index) => ({
            value: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
          }))
    } catch {
      if (active)
        error =
          'Could not list microphones. Check the browser’s microphone permissions.'
    }
  }

  /** Release the local check immediately, including any pending permission request. */
  function stop(): void {
    revision++
    clearTimeout(timer)
    audio?.close()
    audio = undefined
    if (testing && !error)
      status = heardSound
        ? 'Microphone check passed.'
        : 'No sound detected. Check the input, mute switch, and microphone level.'
    testing = false
    level = 0
  }

  /** Select an input explicitly; never mutate the desktop's global default.
   * @param id Browser input ID.
   */
  function select(id: string): void {
    stop()
    selected = id
    status = ''
    error = ''
  }

  /** Check the actual call audio pipeline locally for eight seconds, retaining no audio. */
  async function test(): Promise<void> {
    if (!active || testing) return
    error = ''
    status = 'Opening microphone…'
    level = 0
    heardSound = false
    testing = true
    const attempt = ++revision
    const current = new BrowserVoiceAudio(
      packet => {
        if (!active || revision !== attempt) return
        const samples = new DataView(packet)
        let peak = 0
        for (let index = 0; index + 1 < samples.byteLength; index += 2)
          peak = Math.max(peak, Math.abs(samples.getInt16(index, true)) / 32768)
        level = Math.max(peak, level * 0.7)
        if (peak > 0.01) heardSound = true
      },
      message => {
        if (!active || revision !== attempt) return
        error = message
        status = ''
        stop()
      },
      selected,
    )
    audio = current
    try {
      await current.start()
      if (!active || revision !== attempt) return
      status = 'Speak now — this check stays on your device.'
      timer = setTimeout(stop, 8000)
      await refresh()
    } catch (failure) {
      if (!active || revision !== attempt) return
      error =
        failure instanceof Error ? failure.message : 'Could not test the microphone'
      status = ''
      stop()
      await refresh()
    }
  }

  onMount(() => {
    active = true
    void refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      active = false
      stop()
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
    }
  })
  return {
    get selected() {
      return selected
    },
    get devices() {
      return devices
    },
    get testing() {
      return testing
    },
    get level() {
      return level
    },
    get status() {
      return status
    },
    get error() {
      return error
    },
    select,
    refresh,
    test,
    stop,
  }
}
