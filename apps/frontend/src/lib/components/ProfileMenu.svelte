<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import { DropdownMenu } from "bits-ui";
  import { untrack } from "svelte";

  // Mute / block actions for a profile other than your own. `username` is the
  // plain username for local accounts and the `user@host` handle for remote
  // ones; the matching local/remote endpoints are chosen by `remote`.
  let {
    username,
    remote = false,
    muted,
    blocked,
  }: { username: string; remote?: boolean; muted: boolean; blocked: boolean } = $props();

  let isMuted = $state(untrack(() => muted));
  let isBlocked = $state(untrack(() => blocked));
  let busy = $state(false);
  // Re-sync when reused across a client-side navigation between profiles.
  $effect(() => {
    isMuted = muted;
    isBlocked = blocked;
  });

  async function toggleMute() {
    busy = true;
    try {
      if (isMuted) await (remote ? endpoints().remoteUnmute(username) : endpoints().unmute(username));
      else await (remote ? endpoints().remoteMute(username) : endpoints().mute(username));
      isMuted = !isMuted;
    } finally {
      busy = false;
    }
  }

  async function toggleBlock() {
    busy = true;
    try {
      if (isBlocked) {
        await (remote ? endpoints().remoteUnblock(username) : endpoints().unblock(username));
      } else {
        await (remote ? endpoints().remoteBlock(username) : endpoints().block(username));
      }
      isBlocked = !isBlocked;
    } finally {
      busy = false;
    }
  }

  // Verbatim Bits UI docs DropdownMenu.Item class.
  const itemClass =
    "rounded-button data-highlighted:bg-muted ring-0! ring-transparent! flex h-10 w-full cursor-pointer select-none items-center gap-2.5 py-3 pl-3 pr-1.5 text-sm font-medium focus-visible:outline-hidden";
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    disabled={busy}
    aria-label="More actions"
    title="More actions"
    class="inline-flex size-10 shrink-0 select-none items-center justify-center rounded-full border border-input text-foreground shadow-btn hover:bg-muted active:scale-[0.98]"
  >
    <Icon name="more" size={18} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      sideOffset={8}
      align="end"
      class="z-30 w-[200px] rounded-xl border border-muted bg-background px-1 py-1.5 shadow-popover focus-visible:outline-hidden"
    >
      <DropdownMenu.Item onSelect={toggleMute} class={itemClass}>
        <Icon name="mute" size={18} />
        {isMuted ? "Unmute" : "Mute"}
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={toggleBlock} class={`${itemClass} text-destructive`}>
        <Icon name="block" size={18} />
        {isBlocked ? "Unblock" : "Block"}
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
