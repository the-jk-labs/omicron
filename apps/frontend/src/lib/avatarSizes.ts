// SPDX-License-Identifier: AGPL-3.0-or-later
export const AVATAR_SIZES = [18, 24, 28, 34, 36, 40, 44, 56, 72] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];
