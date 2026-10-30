import type { SearchResults } from "@omicron/contract";

export type SearchSection = "posts" | "people" | "tags";

// Ties keep this order: articles are what most searches are for.
const DEFAULT_ORDER: SearchSection[] = ["posts", "people", "tags"];

const normalize = (text: string) => text.trim().toLowerCase().replace(/^[#@]/, "");

/** 3 for an exact name, 2 for a prefix (of the name or one of its words), 1 for anything the backend matched. */
function matchScore(q: string, names: string[]): number {
  let best = 1;
  for (const raw of names) {
    const name = normalize(raw);
    if (name === q) return 3;
    if (name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q))) best = 2;
  }
  return best;
}

/** Non-empty result groups, the one that best matches the query first. */
export function rankSearchSections(query: string, results: SearchResults): SearchSection[] {
  const q = normalize(query);
  const scores: Record<SearchSection, number> = {
    posts: Math.max(0, ...results.posts.map((post) => matchScore(q, [post.title ?? ""]))),
    people: Math.max(0, ...results.people.map((person) => matchScore(q, [person.username, person.displayName]))),
    tags: Math.max(0, ...results.tags.map((tag) => matchScore(q, [tag.name, tag.slug]))),
  };
  return DEFAULT_ORDER.filter((section) => results[section].length > 0).sort(
    (a, b) => scores[b] - scores[a] || DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b),
  );
}
