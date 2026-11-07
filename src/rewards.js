import { refundCoins, spendCoins, topUpCoins } from "./coins.js";
import { costumeById } from "./costumes.js";
import { DANCES } from "./dances.js";
import { FACES } from "./faces.js";
import { t } from "./i18n.js";
import { HAIR_STYLES } from "./look.js";
import { OUTFITS } from "./outfits.js";
import { SONGS } from "./songs.js";

const WALLET_KEY = "asmr-squishy-obby:wallet";

/** Looks every player starts with. Everything else is bought in the rewards shop. */
const FREE_IDS = new Set([
  "outfit:pinafore",
  "face:grin",
  "dance:cheer",
  "dance:none",
  "hair:long",
  "hair:short",
  "hair:redwaves",
  "song:jazz",
  "costume:none",
  "costume:elf",
  "costume:leaves",
]);

/**
 * Things the shop used to sell: Halloween costumes, and the holiday themes, which now come free
 * in their own month only. Anyone who bought one gets the coins back.
 */
const RETIRED = {
  "costume:witch": 3,
  "costume:pumpkin": 3,
  "costume:vampire": 4,
  "costume:bat": 4,
  "costume:zombie": 4,
  "theme:halloween": 6,
  "theme:thanksgiving": 5,
  "theme:christmas": 6,
};

/** Full looks from the reference avatars. Buying one also unlocks its outfit and hair. */
const AVATAR_LOOKS = {
  buns: {
    body: "girl",
    hair: "buns",
    face: "grin",
    hairColor: "#f2d7a4",
    outfit: "overalls",
    skinColor: "#eab892",
    bow: false,
  },
  preppy: {
    body: "girl",
    hair: "headphones",
    face: "grin",
    hairColor: "#6a4330",
    outfit: "hoodie",
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
  buns: ["#4a6fa5", "#ff9fc0", "#f2d7a4"],
  preppy: ["#b9a6ff", "#8a8fa3", "#6a4330"],
  pretty: ["#6b4638", "#8ec4e4", "#f6e4c0"],
};

/** Hair colors sold one by one. `custom` is the color picker, which paints any color. */
const HAIR_COLORS = {
  pink: { label: t("hairColor.pink"), color: "#ff9ec7" },
  blue: { label: t("hairColor.blue"), color: "#9fc8ff" },
  purple: { label: t("hairColor.purple"), color: "#c7a8ff" },
  mint: { label: t("hairColor.mint"), color: "#a8e6cf" },
  silver: { label: t("hairColor.silver"), color: "#dfe2ea" },
  custom: { label: t("hairColor.custom"), icon: "🎨" },
};

/** [item key, coin cost, shop group]. Rainbow sits with hair colors; the bow is an extra. */
const CATALOG = [
  ["avatar:buns", 4, "avatar"],
  ["avatar:preppy", 5, "avatar"],
  ["avatar:pretty", 6, "avatar"],
  ["outfit:overalls", 2, "outfit"],
  ["outfit:hoodie", 2, "outfit"],
  ["outfit:sporty", 3, "outfit"],
  ["outfit:starry", 4, "outfit"],
  ["outfit:inkprint", 5, "outfit"],
  ["face:smile", 1, "face"],
  ["face:dumpling", 2, "face"],
  ["face:wink", 2, "face"],
  ["face:surprised", 2, "face"],
  ["face:sleepy", 2, "face"],
  ["face:quiet", 3, "face"],
  ["face:glam", 3, "face"],
  ["hair:shaggy", 2, "hair"],
  ["hair:buns", 2, "hair"],
  ["hair:waves", 3, "hair"],
  ["hair:headphones", 3, "hair"],
  ["haircolor:pink", 2, "haircolor"],
  ["haircolor:blue", 2, "haircolor"],
  ["haircolor:purple", 2, "haircolor"],
  ["haircolor:mint", 2, "haircolor"],
  ["haircolor:silver", 3, "haircolor"],
  ["extra:rainbow", 4, "haircolor"],
  ["haircolor:custom", 5, "haircolor"],
  ["extra:bow", 1, "extra"],
  ["costume:turkey", 4, "costume"],
  ["costume:pilgrim", 3, "costume"],
  ["costume:scarecrow", 3, "costume"],
  ["costume:pie", 4, "costume"],
  ["costume:santa", 3, "costume"],
  ["costume:reindeer", 3, "costume"],
  ["costume:snowman", 4, "costume"],
  ["costume:gingerbread", 4, "costume"],
  ["costume:angel", 4, "costume"],
  ["dance:wave", 1, "dance"],
  ["dance:jelly", 2, "dance"],
  ["dance:floss", 2, "dance"],
  ["dance:twirl", 2, "dance"],
  ["dance:dab", 2, "dance"],
  ["dance:disco", 3, "dance"],
  ["dance:robot", 3, "dance"],
  ["dance:chicken", 3, "dance"],
  ["dance:bunny", 3, "dance"],
  ["dance:starjump", 3, "dance"],
  ["dance:sprinkler", 4, "dance"],
  ["song:lounge", 2, "song"],
  ["song:game", 3, "song"],
  ["song:dj", 4, "song"],
  ["song:party", 4, "song"],
];

const GROUP_DEFS = [
  ["avatar", "shop.avatars"],
  ["outfit", "shop.outfits"],
  ["face", "shop.faces"],
  ["hair", "shop.hair"],
  ["haircolor", "shop.hairColors"],
  ["extra", "shop.extras"],
  ["costume", "shop.costumes"],
  ["dance", "shop.dances"],
  ["song", "shop.songs"],
];

function labelFor(kind, id) {
  if (kind === "outfit") return OUTFITS.find((outfit) => outfit.id === id)?.label ?? id;
  if (kind === "face") return FACES.find((face) => face.id === id)?.label ?? id;
  if (kind === "dance") return DANCES.find((dance) => dance.id === id)?.label ?? id;
  if (kind === "hair") return HAIR_STYLES.find((style) => style.id === id)?.label ?? id;
  if (kind === "song") return SONGS.find((song) => song.id === id)?.label ?? id;
  if (kind === "costume") return costumeById(id).label;
  if (kind === "haircolor") return HAIR_COLORS[id]?.label ?? id;
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
    icon: kind === "haircolor" ? (HAIR_COLORS[id]?.icon ?? null) : null,
    color: kind === "haircolor" ? (HAIR_COLORS[id]?.color ?? null) : null,
    look: avatar,
  };
});

/** The shop key that unlocks a hair color, or null when the color is free. */
export function hairColorKey(color) {
  if (color === "rainbow") return "extra:rainbow";
  const id = Object.keys(HAIR_COLORS).find((name) => HAIR_COLORS[name].color === color);
  return id ? `haircolor:${id}` : null;
}

export const SHOP_GROUPS = GROUP_DEFS.map(([id, titleKey, noteKey]) => ({
  id,
  titleKey,
  noteKey,
  items: SHOP_ITEMS.filter((item) => item.group === id),
}));

export function itemKey(kind, id) {
  return `${kind}:${id}`;
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

export function loadWallet(look, coins, best) {
  const wallet = { owned: [] };
  let starsSpent = 0;
  let paysInCoins = false;
  let retired = false;
  try {
    const data = JSON.parse(localStorage.getItem(WALLET_KEY) ?? "null");
    paysInCoins = data?.currency === "coins";
    if (Number.isFinite(data?.spent) && data.spent >= 0) starsSpent = Math.floor(data.spent);
    if (Array.isArray(data?.owned)) {
      wallet.owned = data.owned.filter((key) => SHOP_ITEMS.some((item) => item.key === key));
      const refund = data.owned.reduce((sum, key) => sum + (RETIRED[key] ?? 0), 0);
      if (refund > 0) {
        refundCoins(coins, refund);
        retired = true;
      }
    }
  } catch {
    // A broken save starts as an empty wallet.
  }

  let changed = !paysInCoins || retired;
  if (!paysInCoins) {
    // Older saves earned 3 stars per level past the first. Unspent stars become coins, 3 to 1,
    // but coins already earned on those same levels are not paid twice.
    const starsLeft = Math.max(0, (best - 1) * 3 - starsSpent);
    topUpCoins(coins, Math.floor(starsLeft / 3));
  }

  // Keep whatever this browser already had equipped, without charging for it.
  const equipped = [
    itemKey("outfit", look.outfit),
    itemKey("face", look.face),
    itemKey("dance", look.dance),
    itemKey("hair", look.hair),
    itemKey("song", look.song),
    itemKey("costume", look.costume),
  ];
  if (look.bow) equipped.push("extra:bow");
  const colorKey = hairColorKey(look.hairColor);
  if (colorKey) equipped.push(colorKey);
  for (const key of equipped) {
    if (SHOP_ITEMS.some((item) => item.key === key) && !wallet.owned.includes(key)) {
      wallet.owned.push(key);
      changed = true;
    }
  }
  if (changed) saveWallet(wallet);
  return wallet;
}

export function tryBuy(wallet, key, coins) {
  const item = SHOP_ITEMS.find((entry) => entry.key === key);
  if (!item || isOwned(wallet, key)) return { ok: false, reason: "owned" };
  if (!spendCoins(coins, item.cost)) return { ok: false, reason: "broke" };
  wallet.owned.push(key);
  saveWallet(wallet);
  return { ok: true, item };
}

function saveWallet(wallet) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify({ currency: "coins", owned: wallet.owned }));
  } catch {
    // Private mode: the purchase lasts for this visit only.
  }
}
