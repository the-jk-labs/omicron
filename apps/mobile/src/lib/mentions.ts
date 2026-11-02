// @mentions in plain-text comments: `@ada` (local) or `@ada@host` (remote). Matches the backend's
// services/mentions.ts and the web's src/lib/mentions.ts; keep the three in step.

const MENTION_RE = /(?<![\w@.])@([a-z0-9_]{1,30}(?:@[a-z0-9-]+(?:\.[a-z0-9-]+)+)?)(?![\w@])/gi;

export type CommentSegment = { start: number; text: string; mention?: string };

/** Splits comment text into plain runs and mentions (`mention` is the username, without the `@`). */
export function splitMentions(text: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    if (match.index > last) segments.push({ start: last, text: text.slice(last, match.index) });
    segments.push({ start: match.index, text: match[0], mention: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ start: last, text: text.slice(last) });
  return segments;
}

/** The `@handle` being typed at the caret: where it starts and what follows the `@`. */
export type ActiveMention = { start: number; end: number; query: string };

export function activeMention(text: string, caret: number): ActiveMention | null {
  const before = text.slice(0, caret);
  const match = /(?:^|[^\w@.])@([\w.@-]{0,60})$/.exec(before);
  if (!match) return null;
  const start = caret - match[1].length - 1;
  // The rest of the word after the caret is replaced too, so picking mid-word doesn't leave a tail.
  const after = /^[\w.@-]*/.exec(text.slice(caret))?.[0] ?? "";
  return { start, end: caret + after.length, query: match[1] };
}

/** Replaces the active `@query` with `@username ` and returns the new text with the caret after it. */
export function insertMention(text: string, active: ActiveMention, username: string) {
  const inserted = `@${username} `;
  const rest = text.slice(active.end).replace(/^ /, "");
  return { text: text.slice(0, active.start) + inserted + rest, caret: active.start + inserted.length };
}

/** What a reply starts with: the person it answers. */
export const replyPrefix = (username: string) => `@${username} `;

/** A reply stays a reply while its text still opens with the mention; deleting it makes a new comment. */
export function stillAddressed(text: string, username: string): boolean {
  const lead = `@${username}`.toLowerCase();
  const head = text.slice(0, lead.length + 1).toLowerCase();
  return head === lead || head === `${lead} ` || head === `${lead}\n`;
}

/** People to suggest for `query`: the thread's own participants first, then search results, without repeats. */
export function mergeSuggestions<T extends { username: string }>(
  query: string,
  participants: readonly T[],
  results: readonly T[],
  limit = 6,
): T[] {
  const q = query.toLowerCase();
  const seen = new Set<string>();
  const out: T[] = [];
  const add = (person: T) => {
    const key = person.username.toLowerCase();
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(person);
  };
  for (const person of participants) if (person.username.toLowerCase().startsWith(q)) add(person);
  for (const person of results) add(person);
  return out;
}
