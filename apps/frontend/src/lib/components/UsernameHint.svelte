<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Put in the same <form> as a password field so password managers know which
     saved login it belongs to (1Password's guidance for change and reset forms).
     The username is the one login identifier everywhere: it is what registration
     saves, it never changes, and sign-in accepts it. -->
<script lang="ts">
  let { username }: { username: string } = $props();
</script>

<input
  type="text"
  name="username"
  autocomplete="username"
  value={username}
  readonly
  tabindex="-1"
  aria-hidden="true"
  style="display: none"
/>
