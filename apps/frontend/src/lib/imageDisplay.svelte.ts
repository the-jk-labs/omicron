// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/env";
import { imageDescriptions } from "#lib/actions/imageDescriptions.js";
import { readStorage, writeStorage } from "#lib/storage.js";

export type ImageDisplayPreference = "system" | "show" | "hide";
export const IMAGE_DISPLAY_OPTIONS: { value: ImageDisplayPreference; label: string }[] = [
  { value: "system", label: "Follow reduced-motion setting" },
  { value: "show", label: "Show images" },
  { value: "hide", label: "Hide images" },
];
const STORAGE_KEY = "image-display";
const query = () => window.matchMedia("(prefers-reduced-motion: reduce)");

function preference(): ImageDisplayPreference {
  const saved = browser ? readStorage(STORAGE_KEY) : null;
  return saved === "show" || saved === "hide" ? saved : "system";
}

class ImageDisplayState {
  preference = $state<ImageDisplayPreference>(preference());
  reducedMotion = $state(browser && query().matches);
  hidden = $derived(this.preference === "hide" || (this.preference === "system" && this.reducedMotion));

  set(next: ImageDisplayPreference) {
    this.preference = next;
    if (browser) {
      writeStorage(STORAGE_KEY, next === "system" ? null : next);
      this.apply();
    }
  }

  private apply() {
    document.documentElement.dataset.imageDisplay = this.hidden ? "hide" : "show";
  }

  start(root: HTMLElement) {
    this.preference = preference();
    const media = query();
    this.reducedMotion = media.matches;
    const descriptions = imageDescriptions(root);
    const changed = (event: MediaQueryListEvent) => (this.reducedMotion = event.matches);
    media.addEventListener("change", changed);
    const stop = $effect.root(() => {
      $effect(() => {
        this.apply();
        descriptions.update(this.hidden);
      });
    });
    return () => {
      stop();
      descriptions.destroy();
      media.removeEventListener("change", changed);
    };
  }
}

export const imageDisplay = new ImageDisplayState();
