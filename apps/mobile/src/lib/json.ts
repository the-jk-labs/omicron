/** `JSON.parse` that yields `undefined` for malformed text, for input a zod schema checks next. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
