// SPDX-License-Identifier: AGPL-3.0-or-later

// Counts password confirmations this page load. A confirmation anywhere starts a
// fresh session, so every section waiting on one can retry.
export const freshSignIn = $state({ confirmations: 0 });
