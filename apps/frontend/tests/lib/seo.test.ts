import { blogPostingLd, breadcrumbLd, profilePageLd, serializeJsonLd, webSiteLd } from "$lib/seo";
import type { Profile } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { post } from "../fixtures";

const site = { origin: "https://blog.example", appName: "Omicron" };
const canonical = "https://blog.example/@ada/hello-world";

describe("serializeJsonLd", () => {
  test("a hostile title cannot close the script element, and parses back unchanged", () => {
    const data = { headline: "</script><script>alert(1)</script> & \u2028" };
    const out = serializeJsonLd(data);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(data);
  });
});

describe("blogPostingLd", () => {
  test("describes the article with its canonical URL, author and publisher", () => {
    const ld = blogPostingLd(
      post({
        language: "az",
        tags: [
          { slug: "a", name: "A" },
          { slug: "b", name: "B" },
        ],
        updatedAt: "2026-02-01T00:00:00Z",
      }),
      { canonical, description: "Desc", image: "https://img.example/a.png", site },
    );
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "Hello world",
      description: "Desc",
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      url: canonical,
      datePublished: "2026-01-01T12:00:00.000Z",
      dateModified: "2026-02-01T00:00:00Z",
      inLanguage: "az",
      image: "https://img.example/a.png",
      keywords: "A, B",
      author: { "@type": "Person", name: "Ada", url: "https://blog.example/@ada" },
      publisher: {
        "@type": "Organization",
        name: "Omicron",
        url: "https://blog.example",
        logo: { "@type": "ImageObject", url: "https://blog.example/icon-512.png" },
      },
    });
  });

  test("omits what it cannot vouch for", () => {
    const ld = blogPostingLd(post({ title: null, language: "not a tag!", tags: [] }), {
      canonical,
      description: "",
      image: "/relative.png",
      site,
    });
    for (const key of ["headline", "description", "dateModified", "inLanguage", "image", "keywords"]) {
      expect(ld).not.toHaveProperty(key);
    }
  });
});

test("the breadcrumb runs instance → author → this page", () => {
  const ld = breadcrumbLd(post(), { canonical, site });
  expect(ld.itemListElement).toEqual([
    { "@type": "ListItem", position: 1, name: "Omicron", item: "https://blog.example" },
    { "@type": "ListItem", position: 2, name: "Ada", item: "https://blog.example/@ada" },
    { "@type": "ListItem", position: 3, name: "Hello world", item: canonical },
  ]);
  expect(breadcrumbLd(post({ title: null }), { canonical, site }).itemListElement[2].name).toBe("Post");
});

test("a profile page names the person, their fediverse handle and their links", () => {
  const profile = {
    user: {
      username: "ada",
      displayName: "Ada",
      bio: "",
      avatarUrl: "https://blog.example/api/uploads/a.webp",
      links: [{ platform: "github", url: "https://github.com/ada", label: "" }],
    },
  } as unknown as Profile;
  expect(profilePageLd(profile, { canonical: "https://blog.example/@ada", site })).toEqual({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: "https://blog.example/@ada",
    mainEntity: {
      "@type": "Person",
      name: "Ada",
      alternateName: "@ada@blog.example",
      image: "https://blog.example/api/uploads/a.webp",
      url: "https://blog.example/@ada",
      sameAs: ["https://github.com/ada"],
    },
  });
});

test("the site itself, with no SearchAction", () => {
  const ld = webSiteLd({ description: "", site });
  expect(ld).toMatchObject({ "@type": "WebSite", name: "Omicron", url: "https://blog.example" });
  expect(ld).not.toHaveProperty("description");
  expect(JSON.stringify(ld)).not.toContain("SearchAction");
});
