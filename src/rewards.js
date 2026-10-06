import { DANCES } from "./dances.js";
import { FACES } from "./faces.js";
import { t } from "./i18n.js";
import { HAIR_STYLES } from "./look.js";
import { OUTFITS } from "./outfits.js";

const WALLET_KEY = "asmr-squishy-obby:wallet";

/** Looks every player starts with. Everything else is bought in the rewards shop. */
const FREE_IDS = new Set([
  "outfit:pinafore",
  "face:grin",
  "dance:cheer",
  "dance:none",
  "hair:long",
  "hair:short",
]);

/** Full looks from the reference avatars. Buying one also unlocks its outfit and hair. */
const AVATAR_LOOKS = {
  buns: {
    body: "girl",
    hair: "buns",
    face: "grin",
    hairColor: "#f2d7a4",
    outfit: "buns",
    skinColor: "#eab892",
    bow: false,
  },
  preppy: {
    body: "girl",
    hair: "headphones",
    face: "grin",
    hairColor: "#6a4330",
    outfit: "preppy",
    skinColor: "#eab892",
    bow: false,
  },
  pretty: {
    body: "girl",
    hair: "waves",
    face: "grin",
    hairColor: "#f6e4c0",
    outfit: "pretty",
    skinColor: "#ffe0c8",
    bow: false,
  },
};

const AVATAR_SWATCHES = {
  buns: ["#eceae4", "#d2b48c", "#f2d7a4"],
  preppy: ["#d7d7dc", "#141414", "#6a4330"],
  pretty: ["#6b4638", "#8ec4e4", "#f6e4c0"],
};

/** [item key, star cost, shop group]. Rainbow sits with hair; the bow is an extra. */
const CATALOG = [
  ["avatar:buns", 12, "avatar"],
  ["avatar:preppy", 15, "avatar"],
  ["avatar:pretty", 18, "avatar"],
  ["outfit:overalls", 6, "outfit"],
  ["outfit:hoodie", 6, "outfit"],
  ["outfit:sporty", 9, "outfit"],
  ["outfit:starry", 12, "outfit"],
  ["outfit:inkprint", 15, "outfit"],
  ["face:smile", 3, "face"],
  ["face:dumpling", 6, "face"],
  ["face:wink", 6, "face"],
  ["face:surprised", 6, "face"],
  ["face:sleepy", 6, "face"],
  ["face:quiet", 9, "face"],
  ["hair:shaggy", 6, "hair"],
  ["extra:rainbow", 12, "hair"],
  ["extra:bow", 3, "extra"],
  ["dance:wave", 3, "dance"],
  ["dance:jelly", 6, "dance"],
  ["dance:floss", 6, "dance"],
  ["dance:twirl", 6, "dance"],
  ["dance:dab", 6, "dance"],
  ["dance:disco", 9, "dance"],
  ["dance:robot", 9, "dance"],
  ["dance:chicken", 9, "dance"],
  ["dance:bunny", 9, "dance"],
  ["dance:starjump", 9, "dance"],
  ["dance:sprinkler", 12, "dance"],
];

const GROUP_DEFS = [
  ["avatar", "shop.avatars"],
  ["outfit", "shop.outfits"],
  ["face", "shop.faces"],
  ["hair", "shop.hair"],
  ["extra", "shop.extras"],
  ["dance", "shop.dances"],
];

function labelFor(kind, id) {
  if (kind === "outfit") return OUTFITS.find((outfit) => outfit.id === id)?.label ?? id;
  if (kind === "face") return FACES.find((face) => face.id === id)?.label ?? id;
  if (kind === "dance") return DANCES.find((dance) => dance.id === id)?.label ?? id;
  if (kind === "hair") return HAIR_STYLES.find((style) => style.id === id)?.label ?? id;
  if (kind === "avatar") {
    if (id === "buns") return t("avatar.buns");
    if (id === "preppy") return t("avatar.preppy");
    if (id === "pretty") return t("avatar.pretty");
  }
  if (id === "bow") return t("shop.bow");
  if (id === "rainbow") return t("shop.rainbow");
  return id;
}

export const SHOP_ITEMS = CATALOG.map(([key, cost, group]) => {
  const [kind, id] = key.split(":");
  const outfit = kind === "outfit" ? OUTFITS.find((entry) => entry.id === id) : null;
  const avatar = kind === "avatar" ? AVATAR_LOOKS[id] : null;
  return {
    key,
    kind,
    id,
    cost,
    group,
    label: labelFor(kind, id),
    swatch: avatar ? AVATAR_SWATCHES[id] : (outfit?.swatch ?? null),
    look: avatar,
  };
});

export const SHOP_GROUPS = GROUP_DEFS.map(([id, titleKey]) => ({
  id,
  titleKey,
  items: SHOP_ITEMS.filter((item) => item.group === id),
}));

export function itemKey(kind, id) {
  return `${kind}:${id}`;
}

/** Three stars for each best level after the first. */
export function starsEarned(best) {
  return Math.max(0, best - 1) * 3;
}

export function starsLeft(best, wallet) {
  return Math.max(0, starsEarned(best) - wallet.spent);
}

export function priceOf(key) {
  return SHOP_ITEMS.find((item) => item.key === key)?.cost ?? 0;
}

export function isOwned(wallet, key) {
  if (FREE_IDS.has(key) || wallet.owned.includes(key)) return true;
  return Object.entries(AVATAR_LOOKS).some(([id, look]) => {
    if (!wallet.owned.includes(`avatar:${id}`)) return false;
    return key === `outfit:${look.outfit}` || key === `hair:${look.hair}`;
  });
}

export function loadWallet(look) {
  const wallet = { spent: 0, owned: [] };
  try {
    const data = JSON.parse(localStorage.getItem(WALLET_KEY) ?? "null");
    if (Number.isFinite(data?.spent) && data.spent >= 0) wallet.spent = Math.floor(data.spent);
    if (Array.isArray(data?.owned)) {
      wallet.owned = data.owned.filter((key) => SHOP_ITEMS.some((item) => item.key === key));
    }
  } catch {
    // A broken save starts as an empty wallet.
  }

  // Keep whatever this browser already had equipped, without charging for it.
  const equipped = [
    itemKey("outfit", look.outfit),
    itemKey("face", look.face),
    itemKey("dance", look.dance),
    itemKey("hair", look.hair),
  ];
  if (look.bow) equipped.push("extra:bow");
  if (look.hairColor === "rainbow") equipped.push("extra:rainbow");
  let changed = false;
  for (const key of equipped) {
    if (SHOP_ITEMS.some((item) => item.key === key) && !wallet.owned.includes(key)) {
      wallet.owned.push(key);
      changed = true;
    }
  }
  if (changed) saveWallet(wallet);
  return wallet;
}

export function tryBuy(wallet, key, best) {
  const item = SHOP_ITEMS.find((entry) => entry.key === key);
  if (!item || isOwned(wallet, key)) return { ok: false, reason: "owned" };
  if (starsLeft(best, wallet) < item.cost) return { ok: false, reason: "broke" };
  wallet.spent += item.cost;
  wallet.owned.push(key);
  saveWallet(wallet);
  return { ok: true, item };
}

function saveWallet(wallet) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify({ spent: wallet.spent, owned: wallet.owned }));
  } catch {
    // Private mode: the purchase lasts for this visit only.
  }
}
