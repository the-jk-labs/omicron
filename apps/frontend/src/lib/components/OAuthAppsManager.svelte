<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The OAuth applications this account registered. This is the only way to create
     one. The client secret exists in plaintext only in the response that made it,
     so it is held here and surfaced once, like a publishing token. -->
<script lang="ts">
  import { Checkbox, Label } from "bits-ui";
  import { onMount } from "svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import type { OAuthApp, OAuthAppPermission } from "#lib/types.js";

  const IDENTITY_SCOPE = "read:accounts";

  let apps = $state<OAuthApp[]>([]);
  let availableScopes = $state<OAuthAppPermission[]>([]);
  let loading = $state(true);
  let error = $state("");
  let busy = $state(false);

  let formOpen = $state(false);
  let editing = $state<OAuthApp | null>(null);
  let name = $state("");
  let website = $state("");
  let callbacks = $state("");
  let publicClient = $state(false);
  let scopes = $state<string[]>([IDENTITY_SCOPE]);

  // The one and only time this value exists outside the application's own server.
  let freshSecret = $state<{ appName: string; clientId: string; secret: string } | null>(null);
  let copied = $state("");

  const field =
    "w-full rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm leading-none font-medium";

  async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`/api/oauth/apps${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description ?? data.error ?? "That didn't work. Try again.");
    return data;
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (err) {
      error = err instanceof Error ? err.message : "That didn't work. Try again.";
    } finally {
      busy = false;
    }
  }

  function openForm(app: OAuthApp | null = null) {
    editing = app;
    name = app?.name ?? "";
    website = app?.website ?? "";
    callbacks = app?.redirectUris.join("\n") ?? "";
    publicClient = app?.publicClient ?? false;
    scopes = app ? [...app.scopes] : [IDENTITY_SCOPE];
    error = "";
    formOpen = true;
  }

  const toggleScope = (scope: string, checked: boolean) => {
    scopes = checked ? [...scopes, scope] : scopes.filter((item) => item !== scope);
  };

  const save = () =>
    run(async () => {
      const fields = {
        client_name: name,
        redirect_uris: callbacks,
        scopes: scopes.join(" "),
        ...(website.trim() ? { website: website.trim() } : {}),
      };
      if (editing) {
        const { app } = await request<{ app: OAuthApp }>(`/${encodeURIComponent(editing.id)}`, "PATCH", fields);
        apps = apps.map((item) => (item.id === app.id ? app : item));
      } else {
        const created = await request<{ app: OAuthApp; clientSecret: string | null }>("", "POST", {
          ...fields,
          token_endpoint_auth_method: publicClient ? "none" : "client_secret_basic",
        });
        apps = [created.app, ...apps];
        if (created.clientSecret) showSecret(created.app, created.clientSecret);
      }
      formOpen = false;
    });

  function showSecret(app: OAuthApp, secret: string) {
    freshSecret = { appName: app.name, clientId: app.id, secret };
    copied = "";
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      copied = value;
    } catch {
      // Clipboard access can be refused. The value is on screen and selectable.
    }
  }

  async function rotate(app: OAuthApp) {
    const { ok } = await confirm({
      title: "Generate a new client secret?",
      description: `The current secret for “${app.name}” stops working immediately, until the application uses the new one.`,
      confirmText: "Generate",
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      const { clientSecret } = await request<{ clientSecret: string }>(`/${encodeURIComponent(app.id)}/secret`, "POST");
      showSecret(app, clientSecret);
    });
  }

  async function remove(app: OAuthApp) {
    const { ok } = await confirm({
      title: "Delete this application?",
      description: `“${app.name}” stops working, and everyone who approved it is disconnected. This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      await request(`/${encodeURIComponent(app.id)}`, "DELETE");
      apps = apps.filter((item) => item.id !== app.id);
      if (freshSecret?.clientId === app.id) freshSecret = null;
    });
  }

  onMount(async () => {
    try {
      const data = await request<{ apps: OAuthApp[]; availableScopes: OAuthAppPermission[] }>("");
      apps = data.apps;
      availableScopes = data.availableScopes;
    } catch {
      error = "Could not load your applications.";
    } finally {
      loading = false;
    }
  });
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
  <div class="min-w-0">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">OAuth applications</h2>
    <p class="mt-1 max-w-prose text-sm text-muted-foreground">
      Applications you've registered so people can sign in or connect them to their accounts.
    </p>
  </div>
  {#if !formOpen && !loading}
    <Button variant="outline" size="sm" onclick={() => openForm()}>
      <Icon name="plus" size={15} />
      New application
    </Button>
  {/if}
</div>

{#if error}<p role="alert" class="mt-3 text-sm text-destructive">{error}</p>{/if}

{#if freshSecret}
  <div class="mt-4 rounded-card border border-foreground/30 bg-muted p-4">
    <p class="text-sm font-semibold text-foreground">Copy the secret for {freshSecret.appName} now</p>
    <p class="mt-1 text-sm text-muted-foreground">It won't be shown again. Keep it on your server.</p>
    <div class="mt-3 flex items-center gap-2">
      <code
        class="min-w-0 flex-1 overflow-x-auto rounded-input border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
        >{freshSecret.secret}</code
      >
      <Button variant="outline" size="sm" onclick={() => copy(freshSecret!.secret)}>
        <Icon name={copied === freshSecret.secret ? "check" : "copy"} size={15} />
        {copied === freshSecret.secret ? "Copied" : "Copy"}
      </Button>
    </div>
    <div class="mt-3 flex justify-end">
      <Button variant="ghost" size="sm" onclick={() => (freshSecret = null)}>Done</Button>
    </div>
  </div>
{/if}

{#if formOpen}
  <form
    class="mt-4 flex flex-col gap-4 rounded-card border border-border bg-background-alt p-4"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <div class="flex flex-col gap-1.5">
      <Label.Root for="oauth-app-name" class={labelClass}>Name</Label.Root>
      <input id="oauth-app-name" bind:value={name} maxlength={100} required class={`${field} h-10`} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="oauth-app-website" class={labelClass}>Website (optional)</Label.Root>
      <input
        id="oauth-app-website"
        bind:value={website}
        type="url"
        placeholder="https://app.example"
        class={`${field} h-10`}
      />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="oauth-app-callbacks" class={labelClass}>Callback URLs, one per line</Label.Root>
      <textarea
        id="oauth-app-callbacks"
        bind:value={callbacks}
        rows={3}
        required
        placeholder="https://app.example/oauth/callback"
        class={`${field} py-2 font-mono`}></textarea>
    </div>
    {#if !editing}
      <Checkbox.Root bind:checked={publicClient} class="flex items-center gap-2.5 text-left text-sm text-foreground">
        {#snippet children({ checked })}
          <span
            class="flex size-5 shrink-0 items-center justify-center rounded-9px border border-border-input bg-background shadow-btn {checked
              ? 'border-foreground bg-foreground text-background'
              : ''}"
          >
            {#if checked}<Icon name="check" class="h-3.5 w-3.5" />{/if}
          </span>
          Public client: a mobile or browser app that can't keep a secret
        {/snippet}
      </Checkbox.Root>
    {/if}
    <fieldset class="flex flex-col gap-2">
      <legend class={`${labelClass} mb-2`}>Permissions it may request</legend>
      <div class="flex max-h-72 flex-col gap-2.5 overflow-y-auto rounded-input border border-border bg-background p-3">
        {#each availableScopes as permission (permission.scope)}
          <Checkbox.Root
            checked={scopes.includes(permission.scope)}
            onCheckedChange={(checked) => toggleScope(permission.scope, checked)}
            class="flex items-start gap-2.5 text-left text-sm text-foreground"
          >
            {#snippet children({ checked })}
              <span
                class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-9px border border-border-input bg-background shadow-btn {checked
                  ? 'border-foreground bg-foreground text-background'
                  : ''}"
              >
                {#if checked}<Icon name="check" class="h-3.5 w-3.5" />{/if}
              </span>
              <span class="min-w-0">
                <span class="block font-mono text-xs font-medium">{permission.scope}</span>
                <span class="block text-xs text-muted-foreground">{permission.description}</span>
              </span>
            {/snippet}
          </Checkbox.Root>
        {/each}
      </div>
    </fieldset>
    <div class="flex justify-end gap-2">
      <Button variant="ghost" size="sm" type="button" onclick={() => (formOpen = false)}>Cancel</Button>
      <Button
        variant="solid"
        size="sm"
        type="submit"
        disabled={busy || !name.trim() || !callbacks.trim() || !scopes.length}
      >
        {busy ? "Saving…" : editing ? "Save" : "Create application"}
      </Button>
    </div>
  </form>
{/if}

{#if loading}
  <p class="mt-4 text-sm text-muted-foreground">Loading…</p>
{:else if apps.length === 0 && !formOpen}
  <p class="py-6 text-center text-sm text-muted-foreground">No applications yet.</p>
{:else}
  <ul class="mt-2 divide-y divide-border">
    {#each apps as app (app.id)}
      <li class="py-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span class="flex min-w-0 items-center gap-3">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-alt">
              <Icon name="plug" size={18} />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-foreground">{app.name}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {app.publicClient ? "Public client" : "Confidential"} · Created <Time iso={app.createdAt} kind="date" />
              </span>
            </span>
          </span>
          <span class="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onclick={() => openForm(app)}>Edit</Button>
            {#if !app.publicClient}
              <Button variant="outline" size="sm" disabled={busy} onclick={() => rotate(app)}>New secret</Button>
            {/if}
            <Button variant="outline" size="sm" disabled={busy} onclick={() => remove(app)}>Delete</Button>
          </span>
        </div>
        <dl class="mt-3 flex flex-col gap-3 rounded-card border border-border bg-background-alt p-3 text-xs">
          <div class="flex flex-col gap-1.5">
            <dt class="font-medium text-muted-foreground">Client ID</dt>
            <dd class="flex items-center gap-2">
              <code
                class="min-w-0 flex-1 overflow-x-auto rounded-input border border-input bg-background px-3 py-2 font-mono text-foreground"
                >{app.id}</code
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => copy(app.id)}
                aria-label={`Copy client ID of ${app.name}`}
              >
                <Icon name={copied === app.id ? "check" : "copy"} size={15} />
              </Button>
            </dd>
          </div>
          <div class="flex flex-col gap-1.5">
            <dt class="font-medium text-muted-foreground">
              {app.redirectUris.length > 1 ? "Callback URLs" : "Callback URL"}
            </dt>
            {#each app.redirectUris as uri (uri)}
              <dd class="font-mono break-all text-foreground">{uri}</dd>
            {/each}
          </div>
          <div class="flex flex-col gap-1.5">
            <dt class="font-medium text-muted-foreground">Permissions</dt>
            <dd class="flex flex-wrap gap-1.5">
              {#each app.scopes as scope (scope)}
                <span class="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-foreground"
                  >{scope}</span
                >
              {/each}
            </dd>
          </div>
        </dl>
      </li>
    {/each}
  </ul>
{/if}
