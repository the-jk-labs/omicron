// SPDX-License-Identifier: AGPL-3.0-or-later
// Vitest stand-in for SvelteKit's virtual `$app/env/public`. Exports are live
// bindings, so `setPublicEnv` changes what an importing component reads.
const DEFAULTS = {
  PUBLIC_APP_NAME: "Omicron",
  PUBLIC_SOURCE_URL: "https://github.com/the-jk-labs/omicron",
  PUBLIC_STATUS_URL: "",
  PUBLIC_CONTACT_URL: "",
  PUBLIC_CONTACT_EMAIL: "",
  PUBLIC_ABUSE_EMAIL: "",
};

type PublicEnv = { [K in keyof typeof DEFAULTS]: string | undefined };

export let PUBLIC_APP_NAME: string | undefined = DEFAULTS.PUBLIC_APP_NAME;
export let PUBLIC_SOURCE_URL: string | undefined = DEFAULTS.PUBLIC_SOURCE_URL;
export let PUBLIC_STATUS_URL: string | undefined = DEFAULTS.PUBLIC_STATUS_URL;
export let PUBLIC_CONTACT_URL: string | undefined = DEFAULTS.PUBLIC_CONTACT_URL;
export let PUBLIC_CONTACT_EMAIL: string | undefined = DEFAULTS.PUBLIC_CONTACT_EMAIL;
export let PUBLIC_ABUSE_EMAIL: string | undefined = DEFAULTS.PUBLIC_ABUSE_EMAIL;

/** Override some variables; everything not given goes back to its default. */
export function setPublicEnv(values: Partial<PublicEnv> = {}): void {
  const next: PublicEnv = { ...DEFAULTS, ...values };
  PUBLIC_APP_NAME = next.PUBLIC_APP_NAME;
  PUBLIC_SOURCE_URL = next.PUBLIC_SOURCE_URL;
  PUBLIC_STATUS_URL = next.PUBLIC_STATUS_URL;
  PUBLIC_CONTACT_URL = next.PUBLIC_CONTACT_URL;
  PUBLIC_CONTACT_EMAIL = next.PUBLIC_CONTACT_EMAIL;
  PUBLIC_ABUSE_EMAIL = next.PUBLIC_ABUSE_EMAIL;
}
