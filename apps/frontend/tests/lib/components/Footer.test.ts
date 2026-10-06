// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Footer from "#lib/components/Footer.svelte";

describe("Footer", () => {
  it("renders legal and AGPL-required links", () => {
    render(Footer, {
      props: {
        appName: "Omicron",
        instance: {
          name: "Omicron",
          domain: "example.com",
          federationEnabled: true,
          setupComplete: true,
          emailEnabled: false,
          emailVerificationRequired: true,
          bannerText: null,
          bannerImageUrl: null,
          aboutHtml: null,
          rulesHtml: null,
          privacyPolicyHtml: null,
          contactEmail: null,
          contactUrl: "https://example.com/contact",
          abuseEmail: null,
          statusUrl: "https://status.example.com",
        },
      },
    });

    const footer = screen.getByTestId("site-footer");
    expect(footer.tagName.toLowerCase()).toBe("footer");

    // Required slots from the issue: About, Instance rules, Privacy, Contact, Source, Status, Fediverse
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Instance rules" })).toHaveAttribute("href", "/about#rules");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "https://example.com/contact");
    // Source appears twice (brand line + nav) — at least one external source link
    const sources = screen.getAllByRole("link", { name: "Source" });
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources[0].getAttribute("href")).toMatch(/github\.com\/the-jk-labs\/omicron/);
    expect(sources[0]).toHaveAttribute("target", "_blank");
    expect(sources[0].getAttribute("rel")).toContain("noopener");

    expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute("href", "https://status.example.com");
    // Fediverse profile link should be present
    const fediCandidates = screen.getAllByText(/@example\.com|Fediverse/);
    expect(fediCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces AGPL §13 notice", () => {
    render(Footer, { props: { appName: "Omicron", instance: null } });
    expect(screen.getByTestId("site-footer").textContent).toMatch(/AGPL-3\.0/);
    expect(screen.getByTestId("site-footer").textContent).toMatch(/Source/);
  });
});
