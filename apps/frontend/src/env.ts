// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineEnvVars } from "@sveltejs/kit/env";

// Every variable is optional (callers fall back to a default), and without a
// schema SvelteKit would refuse to start when one is unset.
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
  PUBLIC_APP_NAME: { public: true, schema: optional, description: "Public-facing name shown in the UI" },
  PUBLIC_SOURCE_URL: { public: true, schema: optional, description: "Where the footer's Source link points" },
  PUBLIC_STATUS_URL: { public: true, schema: optional, description: "External status page linked from the footer" },
  PUBLIC_CONTACT_URL: { public: true, schema: optional, description: "Contact page shown on /contact" },
  PUBLIC_CONTACT_EMAIL: { public: true, schema: optional, description: "Contact email shown on /contact" },
  PUBLIC_ABUSE_EMAIL: { public: true, schema: optional, description: "Abuse contact email shown on /contact" },
  INTERNAL_API_URL: { schema: optional, description: "Backend origin the /api proxy forwards to" },
});
