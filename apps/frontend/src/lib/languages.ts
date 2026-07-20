// SPDX-License-Identifier: AGPL-3.0-or-later

// The languages an author can tag a post with, and the reader can filter feeds
// by. Codes are BCP-47 primary subtags (ISO 639-1 where one exists), matching
// what the backend stores and federates. `name` is the English display name;
// `native` is the endonym, shown alongside so a reader recognizes their own
// language. Curated (not exhaustive) — the most common fediverse languages,
// alphabetized by English name.
export type Language = { code: string; name: string; native: string };

export const LANGUAGES: Language[] = [
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "bg", name: "Bulgarian", native: "Български" },
  { code: "ca", name: "Catalan", native: "Català" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "hr", name: "Croatian", native: "Hrvatski" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "en", name: "English", native: "English" },
  { code: "eo", name: "Esperanto", native: "Esperanto" },
  { code: "et", name: "Estonian", native: "Eesti" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "lv", name: "Latvian", native: "Latviešu" },
  { code: "lt", name: "Lithuanian", native: "Lietuvių" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "sr", name: "Serbian", native: "Српски" },
  { code: "sk", name: "Slovak", native: "Slovenčina" },
  { code: "sl", name: "Slovenian", native: "Slovenščina" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function findLanguage(code: string | null | undefined): Language | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

// Human label for a stored code. Falls back to the raw code (uppercased) for a
// language that isn't in the curated list (e.g. an unusual federated tag).
export function languageLabel(code: string | null | undefined): string {
  if (!code) return "";
  return BY_CODE.get(code)?.name ?? code.toUpperCase();
}
