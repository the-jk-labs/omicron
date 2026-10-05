// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for the avatar being read twice by screen readers (the bug
// reported as "Voctl Voctl", "arifastark arifastark", "Yusif Aliyev Yusif
// Aliyev", "Omicron Blog OB Omicron Blog"). The avatar is decorative: the
// person's name is always rendered as text beside it or as an aria-label on the
// control wrapping it. If the image's `alt` or the initials fallback ever
// expose the name again, these tests fail.
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Avatar from "#lib/components/ui/Avatar.svelte";

describe("Avatar", () => {
  it("renders the image with an empty alt attribute", () => {
    const { container } = render(Avatar, {
      props: { name: "Voctl Voctl", src: "https://example.test/avatar.png", size: 40 },
    });

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("alt", "");
    expect(img).not.toHaveAttribute("title");
  });

  it("hides the initials fallback from assistive tech", () => {
    render(Avatar, { props: { name: "Yusif Aliyev" } });

    const initials = screen.getByText("YA");
    expect(initials).toHaveAttribute("aria-hidden", "true");
  });

  it("leaves the image unnamed, so it cannot repeat the name", () => {
    const { container } = render(Avatar, {
      props: { name: "Omicron Blog", src: "https://example.test/avatar.png", size: 40 },
    });

    expect(container.querySelector("img")).toHaveAccessibleName("");
  });

  it("is read exactly once when the name sits beside it", () => {
    const { container } = render(Avatar, {
      props: { name: "Voctl Voctl", src: "https://example.test/avatar.png", size: 40 },
    });

    // Recreate the author row of a card: one link holding the avatar and the
    // name. If the avatar's alt or initials contributed text, the link's
    // accessible name would be "Voctl Voctl Voctl Voctl" (or "… OB …") and this
    // query would fail instead of matching the single reading.
    const link = document.createElement("a");
    link.setAttribute("href", "/@voctl");
    link.appendChild(container.firstElementChild!);
    const label = document.createElement("span");
    label.textContent = "Voctl Voctl";
    link.appendChild(label);
    document.body.appendChild(link);

    expect(screen.getByRole("link", { name: "Voctl Voctl" })).toBeInTheDocument();
  });

  // A cached photo must paint with the page, not after a test load plus delay.
  it("shows a photo from the first render, without waiting to test-load it", () => {
    const { container } = render(Avatar, {
      props: { name: "Yusif Aliyev", src: "https://example.test/avatar.png", size: 40 },
    });

    expect(container.querySelector("img")).toHaveStyle({ display: "block" });
    expect(screen.getByText("YA")).toHaveStyle({ display: "none" });
  });

  it("falls back to the initials when the photo fails to load", async () => {
    const { container } = render(Avatar, {
      props: { name: "Yusif Aliyev", src: "https://example.test/missing.png", size: 40 },
    });

    await fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toHaveStyle({ display: "none" });
    expect(screen.getByText("YA")).not.toHaveStyle({ display: "none" });
  });

  it("shows the initials when there is no photo", () => {
    const { container } = render(Avatar, { props: { name: "Yusif Aliyev" } });

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("YA")).not.toHaveStyle({ display: "none" });
  });
});
