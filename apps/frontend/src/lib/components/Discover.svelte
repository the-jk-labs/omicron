<script lang="ts">
  import { env } from "$env/dynamic/public";
  import Icon from "$lib/components/Icon.svelte";

  const appName = env.PUBLIC_APP_NAME || "Omicron";
</script>

<aside class="flex flex-col gap-6 text-sm">
  <div>
    <h2 class="text-foreground text-base font-semibold">Discover</h2>
    <p class="text-muted-foreground mt-1 leading-relaxed">
      A place to read, write, and connect — powered by ActivityPub. No lock-in, fully
      self-hostable.
    </p>
  </div>

  <a
    href="https://activitypub.rocks"
    target="_blank"
    rel="noopener noreferrer"
    class="text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
  >
    <Icon name="globe" size={16} /> Learn about the fediverse
  </a>

  <p class="text-muted-foreground text-xs">
    © {new Date().getFullYear()} {appName} · Federated blogging
  </p>
</aside>
