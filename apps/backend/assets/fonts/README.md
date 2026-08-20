# Bundled font

`Inter-SemiBold.ttf` is drawn on the generated post share card (`src/lib/ogCard.ts`). It is the only
face the backend renders text in, and it is bundled rather than taken from the host because the
backend draws inside an ImageMagick wasm sandbox, which sees no system fonts — and because a
container image has none installed to see.

|         |                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------- |
| Family  | Inter 4.1, SemiBold                                                                                  |
| Source  | <https://github.com/rsms/inter/releases/tag/v4.1> (`Inter-4.1.zip`, `extras/ttf/Inter-SemiBold.ttf`) |
| SHA-256 | `78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3`                                   |
| Licence | SIL Open Font License 1.1 — `OFL.txt`, copied unchanged from the same release                        |

The file is the upstream release byte for byte, so the checksum above is all anyone needs to verify
it. It is not subsetted: a subset would be smaller but unreproducible without the exact tooling and
flags used to build it.

Inter is also the app's UI font (`apps/frontend/src/app.css`), so a share card and the page it links
to are set in the same typeface.

## Changing it

`src/lib/fontCoverage.ts` reads the file's own `cmap` table, so swapping in a different face needs
no code change — whatever the new file covers is what the card will draw, and a title outside that
coverage falls back to the instance's brand image. Update this file's table when you do.
