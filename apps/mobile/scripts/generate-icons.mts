// Renders every app icon, splash image and Play Store asset from the web's master logo, so they stay sharp and in
// step with it. Run after the logo changes: `pnpm icons`.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = resolve(import.meta.dirname, "..");
const LOGO = readFileSync(join(ROOT, "../frontend/src/lib/assets/omicron.svg"), "utf8");
const VIEW_BOX = /viewBox="([^"]+)"/.exec(LOGO)?.[1];
const LOGO_INNER = LOGO.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
if (!VIEW_BOX) throw new Error("omicron.svg has no viewBox");

// Keep in step with app.config.ts (adaptive icon background) and the splash backgrounds there.
const ICON_BACKGROUND = "#18181B";
const FONT = (file: string) => join(ROOT, "node_modules/@expo-google-fonts/inter", file);

/** The logo in a square box at (x, y); the viewBox keeps the artwork's own margins. */
const logo = (x: number, y: number, size: number) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${VIEW_BOX}">${LOGO_INNER}</svg>`;

/** The logo centred on a square canvas, its box `scale` of the canvas wide. */
const centred = (canvas: number, scale: number) =>
  logo((canvas * (1 - scale)) / 2, (canvas * (1 - scale)) / 2, canvas * scale);

/** The logo's white body alone, with its black linework cut out so whatever is behind shows through. */
const cutOut = (canvas: number, scale: number) =>
  `<mask id="ink" maskUnits="userSpaceOnUse" x="0" y="0" width="${canvas}" height="${canvas}">${centred(canvas, scale)}</mask>` +
  `<rect width="${canvas}" height="${canvas}" fill="#fff" mask="url(#ink)"/>`;

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

const background = (width: number, height: number) =>
  `<rect width="${width}" height="${height}" fill="${ICON_BACKGROUND}"/>`;

function render(file: string, markup: string) {
  const png = new Resvg(markup, {
    font: {
      fontFiles: [FONT("700Bold/Inter_700Bold.ttf"), FONT("400Regular/Inter_400Regular.ttf")],
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng();
  writeFileSync(join(ROOT, file), png);
  console.log(`  ${file}`);
}

// Launchers mask the adaptive icon to as little as the middle 66 of its 108 dp, so the artwork stays well inside.
const ADAPTIVE_SCALE = 0.62;

render("assets/images/icon.png", svg(1024, 1024, background(1024, 1024) + centred(1024, 0.84)));
render("assets/images/android-icon-foreground.png", svg(1024, 1024, centred(1024, ADAPTIVE_SCALE)));
// Themed icons use only the alpha channel, so this one keeps the white body and turns the black linework into gaps.
render("assets/images/android-icon-monochrome.png", svg(1024, 1024, cutOut(1024, ADAPTIVE_SCALE)));
// The splash screen draws these 200 dp wide (app.config.ts), so 1024 px stays sharp at xxxhdpi. The app also uses
// them as its in-app logo for the light and dark themes.
render("assets/images/splash-light.png", svg(1024, 1024, centred(1024, 1)));
// On the dark splash the lines are cut out rather than drawn black, so no dark outline sits on the dark background.
render("assets/images/splash-dark.png", svg(1024, 1024, cutOut(1024, 1)));

// Play Console: the 512 px store icon and the 1024×500 feature graphic.
render("assets/store/icon-512.png", svg(512, 512, background(512, 512) + centred(512, 0.84)));
render(
  "assets/store/feature-graphic.png",
  svg(
    1024,
    500,
    background(1024, 500) +
      logo(96, 70, 360) +
      `<text x="488" y="262" font-family="Inter" font-weight="700" font-size="112" fill="#FAFAFA">Omicron</text>` +
      `<text x="492" y="326" font-family="Inter" font-size="34" fill="#A1A1AA">Blogging across the fediverse.</text>`,
  ),
);
