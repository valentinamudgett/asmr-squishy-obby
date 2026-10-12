import { DANCES } from "./dances.js";
import { FACES } from "./faces.js";
import { t } from "./i18n.js";
import { OUTFITS } from "./outfits.js";

const STORAGE_KEY = "asmr-squishy-obby:v2";
const LEGACY_KEY = "asmr-squishy-obby";

export const HAIR_SWATCHES = [
  "#f4e2b8",
  "#e8b65a",
  "#8a5a3b",
  "#2e2228",
  "#d8553f",
  "#ff9ec7",
  "#9fc8ff",
  "#c7a8ff",
];

export const BODIES = [
  { id: "girl", label: "Girl" },
  { id: "boy", label: "Boy" },
];

export const AGES = [
  { id: "kid", label: "Kid" },
  { id: "teen", label: "Teen" },
  { id: "adult", label: "Grown-up" },
];

export const HAIR_STYLES = [
  { id: "long", label: t("hair.long") },
  { id: "short", label: t("hair.short") },
  { id: "shaggy", label: t("hair.shaggy") },
  { id: "buns", label: t("hair.buns") },
  { id: "headphones", label: t("hair.headphones") },
  { id: "waves", label: t("hair.waves") },
];

/** The hair style a body starts with until the player picks another. */
export function defaultHair(body) {
  return body === "boy" ? "short" : "long";
}

export const SKIN_SWATCHES = ["#ffe0c8", "#eab892", "#d29a6c", "#a8714a", "#6e4630"];

/** Presets with a `body` also switch girl/boy and hair style; the rest keep the current body. */
export const PRESETS = [
  { name: "Classic", face: "grin", hairColor: "#f4e2b8", outfit: "pinafore", skinColor: "#eab892", bow: false },
  { name: "Dumpling", face: "dumpling", hairColor: "#9fc8ff", outfit: "hoodie", skinColor: "#ffe0c8", bow: true },
  { name: "Rainbow", face: "wink", hairColor: "rainbow", outfit: "starry", skinColor: "#d29a6c", bow: true },
  { name: "Sporty", face: "smile", hairColor: "#2e2228", outfit: "sporty", skinColor: "#a8714a", bow: false },
  {
    name: t("preset.emo"),
    body: "boy",
    hair: "shaggy",
    face: "quiet",
    hairColor: "#141214",
    outfit: "inkprint",
    skinColor: "#ffe0c8",
    bow: false,
  },
];

export function defaultLook() {
  return {
    body: "girl",
    hair: "long",
    age: "kid",
    face: "grin",
    hairColor: "#f4e2b8",
    outfit: "pinafore",
    skinColor: "#eab892",
    bow: false,
    dance: "cheer",
    quality: "high",
  };
}

export function loadLook() {
  const look = defaultLook();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
      if (legacy?.quality === "high" || legacy?.quality === "low") look.quality = legacy.quality;
      return look;
    }
    const data = JSON.parse(raw);
    if (BODIES.some((body) => body.id === data.body)) look.body = data.body;
    look.hair = HAIR_STYLES.some((style) => style.id === data.hair) ? data.hair : defaultHair(look.body);
    if (AGES.some((age) => age.id === data.age)) look.age = data.age;
    if (FACES.some((face) => face.id === data.face)) look.face = data.face;
    if (data.hairColor === "rainbow" || isHex(data.hairColor)) look.hairColor = data.hairColor.toLowerCase();
    if (OUTFITS.some((outfit) => outfit.id === data.outfit)) look.outfit = data.outfit;
    if (isHex(data.skinColor)) look.skinColor = data.skinColor.toLowerCase();
    if (typeof data.bow === "boolean") look.bow = data.bow;
    if (DANCES.some((dance) => dance.id === data.dance)) look.dance = data.dance;
    if (data.quality === "high" || data.quality === "low") look.quality = data.quality;
  } catch {
    return defaultLook();
  }
  return look;
}

export function saveLook(look) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      body: look.body,
      hair: look.hair,
      age: look.age,
      face: look.face,
      hairColor: look.hairColor,
      outfit: look.outfit,
      skinColor: look.skinColor,
      bow: look.bow,
      dance: look.dance,
      quality: look.quality,
    }),
  );
}

function isHex(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
