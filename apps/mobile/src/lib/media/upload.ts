import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

// Same preparation as the web's prepareImage: WebP, at most 1600px wide, quality 0.82.
const MAX_WIDTH = 1600;
const QUALITY = 0.82;

export type PreparedImage = { bytes: ArrayBuffer; contentType: string; width: number; height: number };

/** Opens the photo library; null when the user cancels. `square` crops, for avatars. */
export async function pickImage({ square = false }: { square?: boolean } = {}): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1,
  });
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

/** Downscales and re-encodes a local image, then reads its bytes for a raw upload. */
export async function prepareImage(uri: string, maxWidth = MAX_WIDTH): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  if (original.width > maxWidth) context.resize({ width: maxWidth });
  const image = await (original.width > maxWidth ? context.renderAsync() : Promise.resolve(original));
  const saved = await image.saveAsync({ format: SaveFormat.WEBP, compress: QUALITY });
  // React Native's own fetch reads local files; the API client then sends the bytes.
  const file = await fetch(saved.uri);
  if (!file.ok) throw new Error("Couldn't read the image.");
  const bytes = await file.arrayBuffer();
  return { bytes, contentType: "image/webp", width: saved.width, height: saved.height };
}
