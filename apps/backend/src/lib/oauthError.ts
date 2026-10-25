// SPDX-License-Identifier: AGPL-3.0-or-later
export class OAuthError extends Error {
  constructor(
    public error: string,
    message: string,
    public status = 400,
    public scope?: string,
  ) {
    super(message);
  }
}
