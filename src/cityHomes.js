/**
 * Every home you can live in. Each type has its own lot in the city, and the styles of a type
 * all share that lot's footprint, so a style only changes how the place looks outside and in.
 * `out` and `in` name the props that make a style different (see cityProps.js).
 */
export const HOME_TYPES = [
  { id: "apartment", nameKey: "city.typeApartment", emoji: "🏢" },
  { id: "hotel", nameKey: "city.typeHotel", emoji: "🏨" },
  { id: "house", nameKey: "city.typeHouse", emoji: "🏡" },
  { id: "penthouse", nameKey: "city.typePenthouse", emoji: "🌆" },
  { id: "mansion", nameKey: "city.typeMansion", emoji: "🏰" },
];

export const FREE_HOME = "apt-studio";

export const HOME_STYLES = [
  {
    id: "apt-studio", type: "apartment", price: 0, nameKey: "home.aptStudio", hintKey: "home.aptStudioHint",
    wall: "#f1dcc0", trim: "#c98f5a", window: "#9fd4ff", roof: "#b5783e", floor: "#d9b48a", accent: "#7dcea0",
    out: ["planters"], in: ["plants"],
  },
  {
    id: "apt-loft", type: "apartment", price: 300, nameKey: "home.aptLoft", hintKey: "home.aptLoftHint",
    wall: "#b5523b", trim: "#3b2b2b", window: "#ffe7a8", roof: "#3b2b2b", floor: "#c48a5a", accent: "#ffb347",
    out: ["awnings"], in: ["easel", "plants"],
  },
  {
    id: "apt-gamer", type: "apartment", price: 450, nameKey: "home.aptGamer", hintKey: "home.aptGamerHint",
    wall: "#2b2440", trim: "#ff4dd8", window: "#59f3ff", roof: "#1b1630", floor: "#3a3354", accent: "#7a5cff",
    out: ["neon"], in: ["neon", "gaming"],
  },
  {
    id: "apt-rooftop", type: "apartment", price: 600, nameKey: "home.aptRooftop", hintKey: "home.aptRooftopHint",
    wall: "#e8eef5", trim: "#5b8bd6", window: "#9fd4ff", roof: "#8fa5bf", floor: "#d7c4a8", accent: "#ff8a5a",
    out: ["roofPatio"], in: ["plants", "reading"],
  },
  {
    id: "apt-cozy", type: "apartment", price: 500, nameKey: "home.aptCozy", hintKey: "home.aptCozyHint",
    wall: "#ffe9d6", trim: "#5aa46a", window: "#ffd98a", roof: "#5aa46a", floor: "#e2b98d", accent: "#e98a6a",
    out: ["awnings", "planters"], in: ["reading", "plants"],
  },
  {
    id: "apt-night", type: "apartment", price: 900, nameKey: "home.aptNight", hintKey: "home.aptNightHint",
    wall: "#262b38", trim: "#c9a46a", window: "#ffd27a", roof: "#141a28", floor: "#7a5a40", accent: "#c9a46a",
    flat: true, out: ["planters"], in: [],
  },
  {
    id: "hotel-fancy", type: "hotel", price: 1200, nameKey: "home.hotelFancy", hintKey: "home.hotelFancyHint",
    wall: "#fff3dc", trim: "#d4a017", window: "#ffe7a8", roof: "#b8860b", floor: "#f3e1c0", accent: "#c8102e",
    out: ["carpet", "goldTrim"], in: ["chandelier", "spa"],
  },
  {
    id: "hotel-space", type: "hotel", price: 1800, nameKey: "home.hotelSpace", hintKey: "home.hotelSpaceHint",
    wall: "#c9d3df", trim: "#5b4dff", window: "#7cf2ff", roof: "#8792a3", floor: "#9aa6b8", accent: "#5b4dff",
    out: ["dome", "rings"], in: ["stars", "pods"],
  },
  {
    id: "hotel-jungle", type: "hotel", price: 1500, nameKey: "home.hotelJungle", hintKey: "home.hotelJungleHint",
    wall: "#5d9e57", trim: "#7a4e2d", window: "#d6ffbf", roof: "#3f7a3a", floor: "#a77a4e", accent: "#ffd23f",
    out: ["palms", "waterfall"], in: ["plants", "parrot"],
  },
  {
    id: "hotel-candy", type: "hotel", price: 1600, nameKey: "home.hotelCandy", hintKey: "home.hotelCandyHint",
    wall: "#ffb7d5", trim: "#7ee0c3", window: "#fff6ea", roof: "#ff6fa5", floor: "#ffe0ef", accent: "#7ee0c3",
    out: ["stripes", "lollipops"], in: ["candy", "fountain"],
  },
  {
    id: "hotel-ice", type: "hotel", price: 1700, nameKey: "home.hotelIce", hintKey: "home.hotelIceHint",
    wall: "#d7f3ff", trim: "#7ec8ee", window: "#ffffff", roof: "#ffffff", floor: "#e8f7ff", accent: "#7ec8ee",
    out: ["icicles"], in: ["igloo"],
  },
  {
    id: "house-cottage", type: "house", price: 2500, nameKey: "home.houseCottage", hintKey: "home.houseCottageHint",
    wall: "#e6dccb", trim: "#8b5a3c", window: "#ffe7a8", roof: "#8b5a3c", floor: "#c9a27a", accent: "#e98aa0",
    out: ["fence", "flowers"], in: ["fireplace", "plants"],
  },
  {
    id: "house-farm", type: "house", price: 3000, nameKey: "home.houseFarm", hintKey: "home.houseFarmHint",
    wall: "#fff6ea", trim: "#b8382f", window: "#9fd4ff", roof: "#b8382f", floor: "#c28a55", accent: "#ffd23f",
    out: ["barn", "fence"], in: ["fireplace"],
  },
  {
    id: "house-suburban", type: "house", price: 3200, nameKey: "home.houseSuburban", hintKey: "home.houseSuburbanHint",
    wall: "#9fc6e8", trim: "#ffffff", window: "#e8f7ff", roof: "#4a5568", floor: "#d9c4a3", accent: "#5b8bd6",
    out: ["trampoline", "hoop"], in: ["plants"],
  },
  {
    id: "house-beach", type: "house", price: 3600, nameKey: "home.houseBeach", hintKey: "home.houseBeachHint",
    wall: "#7fd6d0", trim: "#ffffff", window: "#fff6ea", roof: "#f4e2b8", floor: "#f1dcb0", accent: "#ff8a5a",
    out: ["sand", "surf", "palms"], in: ["surf"],
  },
  {
    id: "house-spooky", type: "house", price: 2800, nameKey: "home.houseSpooky", hintKey: "home.houseSpookyHint",
    wall: "#4b3a5e", trim: "#241a33", window: "#b6ff6a", roof: "#241a33", floor: "#5a4a3a", accent: "#ff8a1f",
    out: ["ghosts", "pumpkins"], in: ["ghosts"],
  },
  {
    id: "house-modern", type: "house", price: 4200, nameKey: "home.houseModern", hintKey: "home.houseModernHint",
    wall: "#ffffff", trim: "#3a4252", window: "#a8e6ff", roof: "#d9dde3", floor: "#e9e4dc", accent: "#3ecf8e",
    flat: true, out: ["glass"], in: ["smart"],
  },
  {
    id: "pent-skyline", type: "penthouse", price: 6000, nameKey: "home.pentSkyline", hintKey: "home.pentSkylineHint",
    wall: "#a9b8c9", trim: "#3a4252", window: "#bfe6ff", roof: "#5a6578", floor: "#d8d2c8", accent: "#5b8bd6",
    out: ["balcony"], in: ["skyline"],
  },
  {
    id: "pent-garden", type: "penthouse", price: 6800, nameKey: "home.pentGarden", hintKey: "home.pentGardenHint",
    wall: "#e9efe4", trim: "#5aa46a", window: "#d6ffbf", roof: "#5aa46a", floor: "#c9b28c", accent: "#7dcea0",
    out: ["roofGarden"], in: ["plants", "pond"],
  },
  {
    id: "pent-game", type: "penthouse", price: 7200, nameKey: "home.pentGame", hintKey: "home.pentGameHint",
    wall: "#2f2a4a", trim: "#ffd23f", window: "#ff7eb3", roof: "#1b1630", floor: "#3a3354", accent: "#ff4dd8",
    out: ["invader"], in: ["arcade", "bowling"],
  },
  {
    id: "pent-aquarium", type: "penthouse", price: 8000, nameKey: "home.pentAquarium", hintKey: "home.pentAquariumHint",
    wall: "#5bb8e6", trim: "#1d5f8a", window: "#7cf2ff", roof: "#1d5f8a", floor: "#cfe9f5", accent: "#ff8a3d",
    out: ["balcony"], in: ["fish"],
  },
  {
    id: "pent-space", type: "penthouse", price: 8800, nameKey: "home.pentSpace", hintKey: "home.pentSpaceHint",
    wall: "#c9d3df", trim: "#5b4dff", window: "#d9d2ff", roof: "#8792a3", floor: "#1f2440", accent: "#9b8cff",
    out: ["dome", "telescope"], in: ["stars", "telescope"],
  },
  {
    id: "man-modern", type: "mansion", price: 12000, nameKey: "home.manModern", hintKey: "home.manModernHint",
    wall: "#ffffff", trim: "#3a4252", window: "#a8e6ff", roof: "#d9dde3", floor: "#ece6dc", accent: "#3ec6ff",
    flat: true, out: ["pool", "glass"], in: ["pool"],
  },
  {
    id: "man-castle", type: "mansion", price: 18000, nameKey: "home.manCastle", hintKey: "home.manCastleHint",
    wall: "#b9b2a6", trim: "#6e665a", window: "#ffd98a", roof: "#c8384a", floor: "#8d7f6c", accent: "#c8384a",
    flat: true, out: ["towers", "moat"], in: ["throne", "chandelier"],
  },
  {
    id: "man-beach", type: "mansion", price: 14000, nameKey: "home.manBeach", hintKey: "home.manBeachHint",
    wall: "#fff6ea", trim: "#3ec6c0", window: "#bff6ff", roof: "#e9c891", floor: "#f1dcb0", accent: "#3ec6c0",
    out: ["sand", "palms", "pool"], in: ["pool", "surf"],
  },
  {
    id: "man-lodge", type: "mansion", price: 13000, nameKey: "home.manLodge", hintKey: "home.manLodgeHint",
    wall: "#9c6a3f", trim: "#5a3a22", window: "#ffd98a", roof: "#4a3a2e", floor: "#b07c4f", accent: "#c8384a",
    out: ["chimneys", "hottub", "pines"], in: ["fireplace", "hottub"],
  },
  {
    id: "man-hollywood", type: "mansion", price: 20000, nameKey: "home.manHollywood", hintKey: "home.manHollywoodHint",
    wall: "#fff3dc", trim: "#d4a017", window: "#ffe7a8", roof: "#d4a017", floor: "#f3e1c0", accent: "#c8102e",
    flat: true, out: ["gates", "carpet", "star"], in: ["cinema", "chandelier"],
  },
  {
    id: "man-tree", type: "mansion", price: 16000, nameKey: "home.manTree", hintKey: "home.manTreeHint",
    wall: "#a77a4e", trim: "#5a3a22", window: "#d6ffbf", roof: "#5d9e57", floor: "#b8895a", accent: "#7dcea0",
    out: ["bigTrees", "bridges"], in: ["slide", "plants"],
  },
  {
    id: "man-courtyard", type: "mansion", price: 15000, nameKey: "home.manCourtyard", hintKey: "home.manCourtyardHint",
    wall: "#f4f2ee", trim: "#3a2a1e", window: "#cfe6f2", roof: "#e9e6e1", floor: "#d9d2c6", accent: "#c9a46a",
    flat: true, out: ["glass", "pool"], in: [],
  },
  {
    id: "man-cantilever", type: "mansion", price: 17000, nameKey: "home.manCantilever", hintKey: "home.manCantileverHint",
    wall: "#d9d6d0", trim: "#111216", window: "#9fb6c4", roof: "#e6e3de", floor: "#d9d6d0", accent: "#c9b27a",
    flat: true, out: ["glass", "pool", "palms"], in: [],
  },
  {
    id: "man-hillside", type: "mansion", price: 19000, nameKey: "home.manHillside", hintKey: "home.manHillsideHint",
    wall: "#f8f6f1", trim: "#c49a6c", window: "#bfe6ff", roof: "#f4f1ea", floor: "#d2b48c", accent: "#3ec6c0",
    flat: true, out: ["pool", "palms"], in: [],
  },
];

export function homeStyle(id) {
  return HOME_STYLES.find((style) => style.id === id) ?? null;
}

export function homeType(id) {
  return HOME_TYPES.find((type) => type.id === id) ?? HOME_TYPES[0];
}
