// Custom greenly checks, imported from greenly.config.ts. Each throws on failure.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getConfig } from "expo/config";
import FONT_FILES from "../src/lib/theme/fonts.json" with { type: "json" };

const ROOT = resolve(import.meta.dirname, "..");

/** Verify every asset the Expo config references (icons, splash, fonts) exists on disk. */
export function runAssetCheck(): void {
  const { exp: expo } = getConfig(ROOT, { skipSDKVersionRequirement: true, skipPlugins: true });

  const assetPaths = [
    expo.icon,
    expo.android?.adaptiveIcon?.foregroundImage,
    expo.android?.adaptiveIcon?.monochromeImage,
    "./assets/images/splash-light.png",
    "./assets/images/splash-dark.png",
    ...FONT_FILES.map((file) => `./node_modules/${file}`),
  ].filter((path): path is string => Boolean(path));

  const missing = assetPaths.filter((path) => !existsSync(join(ROOT, path)));
  if (missing.length > 0) throw new Error(`Missing assets:\n${missing.map((path) => `  • ${path}`).join("\n")}`);
  console.log(`  Checked ${assetPaths.length} asset(s) — all present.`);
}
