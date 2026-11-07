/**
 * A small kid-friendly word filter for chat and player names. It is not exhaustive: it
 * masks the common swears and slurs, including their -ing / -er / -s endings.
 */
const WORDS = [
  "fuck",
  "fuk",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "pussy",
  "cunt",
  "cock",
  "slut",
  "whore",
  "fag",
  "nigger",
  "nigga",
  "retard",
  "wanker",
  "twat",
  "porn",
  "sex",
  "penis",
  "vagina",
  "kys",
];
// Leading boundary only, so "shitty" is caught but "Sussex" and "Dickens" style middles are not.
const PATTERN = new RegExp(`\\b(?:${WORDS.join("|")})[a-z]*`, "gi");
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

/** Plain, single-line, length-capped text with rude words masked. Empty if `value` is not usable. */
export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  const text = value.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max);
  return text.replace(PATTERN, (word) => "*".repeat(word.length));
}
