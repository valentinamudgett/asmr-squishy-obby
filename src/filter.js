/**
 * A small kid-friendly word filter for chat and player names. It is not exhaustive: it
 * masks the listed swears and slurs, plus a rude ending (s, es, ed, er, ing, y) or one
 * repeated last letter. "shitty" is caught. "Sussex" and "Dickens" are not.
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
// Whole word only: the stem, one extra copy of its last letter, then one rude ending.
// "shitty" and "fucking" are masked. "Dickens", "Sexton", and "Cocktail" are not.
const SUFFIX = "(?:ing|es|ed|er|y|s)";
const PATTERN = new RegExp(
  `\\b(?:${WORDS.map((word) => `${word}(?:${word.at(-1)})?${SUFFIX}?`).join("|")})\\b`,
  "gi",
);
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
/** Format characters (soft hyphen, zero-width, bidi marks) that can split a swear. */
const FORMAT = /\p{Cf}/gu;

/** Plain, single-line, length-capped text with rude words masked. Empty if `value` is not usable. */
export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  const text = value.replace(CONTROL, "").replace(FORMAT, "").replace(/\s+/g, " ").trim().slice(0, max);
  return text.replace(PATTERN, (word) => "*".repeat(word.length));
}
