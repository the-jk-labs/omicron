// SPDX-License-Identifier: AGPL-3.0-or-later
export const READY_PREFIX = "OMICRON_FEDERATION_READY ";

export type InstanceReady = {
  origin: string;
  userId: string;
  sessionAt: number;
  cookieName: string;
};

export type InboxRequest = {
  path: string;
  body: string;
  headers: Record<string, string>;
  status: number;
};

export type InstanceState = {
  inbox: InboxRequest[];
  actorFetches: number;
  posts: {
    id: string;
    apId: string | null;
    contentHtml: string;
    language: string | null;
    remote: boolean;
    title: string | null;
  }[];
};
