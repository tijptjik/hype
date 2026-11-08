<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// ICONS
import PhoneIcon from 'virtual:icons/lucide/phone'
import VideoIcon from 'virtual:icons/lucide/video'
import VideoOffIcon from 'virtual:icons/lucide/video-off'
import MicIcon from 'virtual:icons/lucide/mic'
import PhoneOffIcon from 'virtual:icons/lucide/phone-off'
import SettingsIcon from 'virtual:icons/lucide/settings-2'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
import Select from '#lib/bits/core/select/Select.svelte'
// COMPONENTS
import CallVideo from './CallVideo.svelte'
// TYPES
import type { Snippet } from 'svelte'
import type { WhatsAppConsoleModel } from '../whatsapp.types.js'

let {
  model,
  compact = false,
  header,
}: {
  model: WhatsAppConsoleModel
  compact?: boolean
  header?: Snippet<[Snippet]>
} = $props()
let microphoneSettingsOpen = $state(false)
let now = $state(Date.now())
onMount(() => {
  const timer = setInterval(() => (now = Date.now()), 1000)
  return () => clearInterval(timer)
})
const current = $derived(model.calls.current)
const ongoing = $derived(current && current.phase !== 'ended')
const recipient = $derived(model.to.trim() || model.selectedChat)
const canCall = $derived(
  model.voiceAvailable &&
    model.status.connected &&
    !model.busy &&
    !model.recording &&
    !model.microphone.testing &&
    !model.callBusy &&
    Boolean(recipient) &&
    !recipient.endsWith('@g.us') &&
    !(model.platform === 'telegram' && /^-\d+$/.test(recipient)),
)
const elapsed = $derived(
  current?.connectedAt
    ? Math.max(0, Math.floor((now - current.connectedAt) / 1000))
    : 0,
)
const duration = $derived(
  `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
)
const labels: Record<string, string> = {
  connecting: 'Connecting…',
  ringing: 'Ringing…',
  active: 'In call',
  ending: 'Ending call…',
  ended: 'Call ended',
}
const hasDetails = $derived(
  ongoing ||
    current?.error ||
    model.calls.incoming.length ||
    microphoneSettingsOpen ||
    model.callBusy ||
    model.callError,
)
</script>

{#snippet actions()}
  <div class="flex shrink-0 items-center gap-1">
    {#if model.ownsCall}
      <Button
        iconComponent={MicIcon}
        hideLabel={compact || Boolean(header)}
        hideLabelInstantly
        modifier={header ? 'circle' : undefined}
        size={header ? 'sm' : 'md'}
        attrs={{ title: model.callMuted ? 'Unmute microphone' : 'Mute microphone' }}
        text={model.callMuted ? 'Unmute' : 'Mute'}
        style="soft"
        disabled={!ongoing ||
          current?.phase === 'connecting' ||
          current?.phase === 'ending'}
        onClick={() => model.muteCall(!model.callMuted)}
      />
      {#if current?.video}
        <Button
          text={model.cameraOff ? 'Camera on' : 'Camera off'}
          iconComponent={model.cameraOff ? VideoOffIcon : VideoIcon}
          hideLabel={Boolean(header)}
          hideLabelInstantly
          modifier={header ? 'circle' : undefined}
          size={header ? 'sm' : 'md'}
          attrs={{ title: model.cameraOff ? 'Turn camera on' : 'Turn camera off' }}
          style="soft"
          onClick={() => model.camera(model.cameraOff)}
        />
      {/if}
      <Button
        iconComponent={PhoneOffIcon}
        text="Hang up"
        hideLabel={Boolean(header)}
        hideLabelInstantly
        modifier={header ? 'circle' : undefined}
        size={header ? 'sm' : 'md'}
        attrs={{ title: 'Hang up' }}
        style="outline"
        color="error"
        onClick={model.endCall}
      />
    {:else}
      <Button
        iconComponent={VideoIcon}
        hideLabel={compact || Boolean(header)}
        hideLabelInstantly
        modifier={header ? 'circle' : undefined}
        size={header ? 'sm' : 'md'}
        attrs={{
          title: model.videoAvailable
            ? 'Start video call'
            : 'Video calling is unavailable for this platform or browser',
        }}
        text="Video call"
        style={header ? 'ghost' : 'soft'}
        disabled={!canCall || !model.videoAvailable}
        onClick={() => void model.startCall(recipient, true)}
      />
      <Button
        iconComponent={PhoneIcon}
        hideLabel={compact || Boolean(header)}
        hideLabelInstantly
        modifier={header ? 'circle' : undefined}
        size={header ? 'sm' : 'md'}
        attrs={{
          title: canCall ? 'Start voice call' : 'Connect this account before calling',
        }}
        text="Voice call"
        style={header ? 'ghost' : 'soft'}
        color="primary"
        disabled={!canCall}
        onClick={() => void model.startCall(recipient)}
      />
    {/if}
    <Button
      text="Microphone settings"
      iconComponent={SettingsIcon}
      hideLabel
      hideLabelInstantly
      modifier="circle"
      style={microphoneSettingsOpen ? 'soft' : 'ghost'}
      size="sm"
      attrs={{ 'aria-expanded': microphoneSettingsOpen, title: 'Microphone settings' }}
      onClick={() => (microphoneSettingsOpen = !microphoneSettingsOpen)}
    />
  </div>
{/snippet}

{#if header}
  {@render header(actions)}
{/if}
{#if !header || hasDetails}
  <section
    aria-label="Voice calls"
    class="flex shrink-0 flex-col gap-2 border-b border-border bg-panel px-4 py-2 {header
      ? 'max-h-[35%] overflow-y-auto'
      : ''}"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      {#if !header || ongoing || model.callBusy}
        <p class="text-muted-foreground text-sm">
          {ongoing
            ? `${labels[current?.phase || 'connecting']}${current?.phase === 'active' ? ` · ${duration}` : ''}`
            : model.callBusy
              ? 'Preparing microphone…'
              : 'Call'}
        </p>
      {/if}
      {#if !header}
        {@render actions()}
      {/if}
    </div>
    {#if current && (ongoing || current.error)}
      <div class="flex min-w-0 items-center gap-2 text-sm">
        <Avatar
          name={model.displayName(current.peer)}
          src={model.profiles[model.canonicalChat(current.peer)]?.photo}
          class="size-8!"
        />
        <div class="min-w-0">
          <p class="font-medium break-words">{model.displayName(current.peer)}</p>
          <p class="text-muted-foreground text-xs">
            {ongoing && !model.ownsCall
              ? 'Another window'
              : model.callMuted && model.ownsCall
                ? 'Microphone off'
                : current.phase === 'ended'
                  ? 'Call ended'
                  : current.video
                    ? 'Video call'
                    : 'Voice call'}
          </p>
        </div>
      </div>
      {#if current.error}
        <p role="status" class="text-muted-foreground text-sm break-words">
          {current.error}
        </p>
      {/if}
    {/if}
    {#if model.ownsCall && current?.video}
      <CallVideo
        local={model.localVideo}
        remote={model.remoteVideo}
        cameraOff={model.cameraOff}
      />
    {/if}
    {#each model.calls.incoming as call (call.id)}
      <div
        class="border-border bg-raised flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
      >
        <div class="flex min-w-0 items-center gap-2">
          <Avatar
            name={model.displayName(call.peer, call.name)}
            src={model.profiles[model.canonicalChat(call.peer)]?.photo}
          />
          <div class="min-w-0">
            <p class="text-sm font-medium break-words">
              {model.displayName(call.peer, call.name)}
            </p>
            <p class="text-muted-foreground text-xs">
              Incoming {call.video ? 'video' : 'voice'} call
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            text={call.video ? 'Answer video' : 'Answer'}
            style="soft"
            color="primary"
            disabled={model.callBusy ||
              model.recording ||
              model.microphone.testing ||
              model.busy ||
              Boolean(call.video && !model.videoAvailable)}
            onClick={() => void model.answerCall(call.id)}
          /><Button
            text="Decline"
            style="outline"
            disabled={model.busy}
            onClick={() => void model.declineCall(call.id)}
          />
        </div>
      </div>
    {/each}

    {#if microphoneSettingsOpen}
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <div class="min-w-0 flex-1 basis-56">
          <Select
            placeholder="Microphone"
            value={model.microphone.selected}
            items={model.microphone.devices}
            onValueChange={model.microphone.select}
            disabled={model.callBusy ||
              model.recording ||
              model.busy ||
              model.microphone.testing}
            triggerClass="w-full min-w-0"
          />
        </div>
        <Button
          text={model.microphone.testing ? 'Stop mic check' : 'Test microphone'}
          style="ghost"
          disabled={model.callBusy || model.recording || model.busy}
          onClick={() =>
            model.microphone.testing
              ? model.microphone.stop()
              : void model.microphone.test()}
        />
      </div>
      {#if model.microphone.testing}
        <meter
          min="0"
          max="1"
          value={model.microphone.level}
          aria-label="Microphone input level"
          class="h-3 w-full"
        ></meter>
      {/if}
      {#if model.microphone.status}
        <p role="status" class="text-muted-foreground text-xs">
          {model.microphone.status}
        </p>
      {/if}
      {#if model.microphone.error}
        <p role="alert" class="text-sm break-words">{model.microphone.error}</p>
      {/if}
    {/if}
    {#if model.callError}
      <p role="alert" class="text-sm break-words">{model.callError}</p>
    {/if}
  </section>
{/if}
