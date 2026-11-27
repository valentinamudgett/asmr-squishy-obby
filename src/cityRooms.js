import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PointLight,
  Quaternion,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { createKit, mergeByMaterial } from "./cityProps.js";
import { buildElevator, elevatorLook } from "./cityElevator.js";
import * as F from "./cityFurniture.js";
import { addWater, removeWater } from "./cityWater.js";

/**
 * The inside of a home: real separate rooms on one or two floors, joined by doorways and stairs,
 * furnished for what each room is and dressed in the home style's theme. Built only while you're
 * inside (city.js calls buildInterior on the way in and dispose on the way out), baked into a
 * few merged meshes, and held up by one static Havok body made of boxes.
 *
 * Layout coordinates are meters in the interior's frame: x across, z back from the front, y up
 * from the ground floor. A door on axis "x" sits in a wall running along x (at z = line); a door
 * on axis "z" sits in a wall running along z (at x = line).
 */

const T = 0.16;
const DOOR_H = 2.1;
const EPS = 1e-4;

export const ROOM_NAMES = {
  living: { nameKey: "room.living", emoji: "🛋️" },
  greatRoom: { nameKey: "room.greatRoom", emoji: "🛋️" },
  kitchen: { nameKey: "room.kitchen", emoji: "🍳" },
  dining: { nameKey: "room.dining", emoji: "🍽️" },
  bedroom: { nameKey: "room.bedroom", emoji: "🛏️" },
  mainBedroom: { nameKey: "room.mainBedroom", emoji: "🛏️" },
  guestBedroom: { nameKey: "room.guestBedroom", emoji: "🛏️" },
  kidsRoom: { nameKey: "room.kidsRoom", emoji: "🧸" },
  loft: { nameKey: "room.loft", emoji: "🛏️" },
  bathroom: { nameKey: "room.bathroom", emoji: "🛁" },
  hallway: { nameKey: "room.hallway", emoji: "🚪" },
  entrance: { nameKey: "room.entrance", emoji: "✨" },
  foyer: { nameKey: "room.foyer", emoji: "🚪" },
  gallery: { nameKey: "room.gallery", emoji: "🖼️" },
  mezzanine: { nameKey: "room.mezzanine", emoji: "📚" },
  sitting: { nameKey: "room.sitting", emoji: "🛋️" },
  roomService: { nameKey: "room.roomService", emoji: "🛎️" },
  gameRoom: { nameKey: "room.gameRoom", emoji: "🎱" },
  dungeon: { nameKey: "room.dungeon", emoji: "🗝️" },
  movieRoom: { nameKey: "room.movieRoom", emoji: "🎬" },
  gym: { nameKey: "room.gym", emoji: "🏋️" },
  garage: { nameKey: "room.garage", emoji: "🚗" },
  balcony: { nameKey: "room.balcony", emoji: "🌇" },
  backyard: { nameKey: "room.backyard", emoji: "🌳" },
  terrace: { nameKey: "room.terrace", emoji: "🔥" },
  poolDeck: { nameKey: "room.poolDeck", emoji: "🏊" },
  lobby: { nameKey: "room.lobby", emoji: "🛎️" },
  roofDeck: { nameKey: "room.roofDeck", emoji: "🌤️" },
};

/** Which look each style gets inside. Styles not listed fall back on "modern". */
const FAMILY = {
  "apt-studio": "walnut",
  "apt-loft": "loft",
  "apt-gamer": "gamer",
  "apt-rooftop": "walnut",
  "apt-cozy": "cozy",
  "apt-night": "night",
  "hotel-fancy": "grand",
  "hotel-space": "space",
  "hotel-jungle": "jungle",
  "hotel-candy": "candy",
  "hotel-ice": "ice",
  "house-cottage": "cottage",
  "house-farm": "farm",
  "house-suburban": "modern",
  "house-beach": "beach",
  "house-spooky": "spooky",
  "house-modern": "modern",
  "pent-skyline": "lux",
  "pent-garden": "garden",
  "pent-game": "gamer",
  "pent-aquarium": "aquarium",
  "pent-space": "space",
  "man-modern": "marble",
  "man-castle": "castle",
  "man-beach": "villa",
  "man-lodge": "lodge",
  "man-hollywood": "hollywood",
  "man-tree": "tree",
  "man-courtyard": "lux",
  "man-cantilever": "stone",
  "man-hillside": "hillside",
};

/** Room colors, finishes, and fixtures for a style. */
export function themeFor(style) {
  const fam = FAMILY[style.id] ?? "modern";
  const w = style.wall;
  const a = style.accent;
  const tr = style.trim;
  const th = {
    fam,
    wood: "#c9a77c",
    woodDark: "#6b4a32",
    fabric: "#e8e2d8",
    fabric2: F.mix(a, "#d8d0c4", 0.55),
    accent: a,
    accent2: F.mix(tr, a, 0.5),
    metal: "#c2a46a",
    metalDark: "#2a2c31",
    cabinet: "#f2efe9",
    counterTop: "#f4f2ee",
    counterVein: "#b8b2a8",
    backsplash: "#ebe7e0",
    fridge: "#c9ced4",
    duvet: "#f6f3ec",
    bedFrame: "#8a6a4a",
    headboard: F.mix(a, "#d8d0c4", 0.65),
    rug: "#e7e0d3",
    vase: "#e9e2d6",
    books: ["#c8102e", "#2b5bd6", "#e9c46a", "#2a9d8f", "#6d597a", "#f4f1ea", "#264653"],
    leaf: "#4f8a4a",
    pot: "#d8d2c8",
    screen: "#26324a",
    frame: "#2a2c31",
    canvas: "#f4f1ea",
    fireStone: "#d8d2c8",
    mantel: "#f4f1ea",
    vanity: "#e9e4dc",
    bathTile: "#eef2f4",
    towel: "#ffffff",
    felt: "#2f7a4a",
    arcade: "#1b1630",
    velvet: "#7a1f2b",
    cinemaFloor: "#2a2028",
    planter: "#3a3d44",
    trim: "#ffffff",
    door: "#f4f1ea",
    baseboard: "#ffffff",
    ceiling: "#fbfaf7",
    ext: w,
    glass: "#cfe6f2",
    glassAlpha: 0.2,
    mullion: "#2a2c31",
    walls: { default: "#f1ede6" },
    floors: {
      default: ["wood", "#c9a77c", "#000"],
      bath: ["tile", "#e8edf0", "#c2cbd1"],
      kitchen: ["tile", "#ece8e1", "#cfc8bd"],
      bedroom: ["carpet", "#ded6c9", "#000"],
      garage: ["plain", "#9aa0a8", "#000"],
      gym: ["plain", "#3a3d44", "#000"],
      movie: ["carpet", "#3a2028", "#000"],
      out: ["deck", "#a8784e", "#000"],
      yard: ["grass", "#6fb562", "#000"],
    },
    wallFinish: null,
    cove: false,
    recessed: true,
    piano: false,
    fireplace: null,
    sofaWood: false,
    sectional: false,
    art: "abstract",
    plants: ["fiddle", "snake"],
    view: "city",
    sky: "day",
    lamp: "#fff1d0",
    edge: "glass",
  };
  const walls = (o) => Object.assign(th.walls, o);
  const floors = (o) => Object.assign(th.floors, o);
  switch (fam) {
    case "walnut":
      Object.assign(th, { wood: "#5a3a26", woodDark: "#3a2416", fabric: "#f4f1ea", fabric2: "#efe9df", accent: "#d8cfc0", accent2: "#c9b8a0", rug: "#ece6da", metal: "#b89a64", cove: true, art: "soft", sectional: false, curvedSofa: true, cabinet: "#5a3a26", counterTop: "#f2efe9" });
      walls({ default: "#efe9e0", living: { kind: "walnut", hex: "#6b4429", alt: "#000" }, bedroom: { kind: "walnut", hex: "#6b4429", alt: "#000" } });
      floors({ default: ["wood", "#4a3020", "#000"], bedroom: ["wood", "#4a3020", "#000"] });
      th.view = "city";
      th.curve = true;
      break;
    case "night":
      Object.assign(th, { fabric: "#e9dfcf", fabric2: "#d8c8b0", accent: "#c9a46a", accent2: "#efe3cf", rug: "#d9cdb8", cove: true, piano: true, fireplace: "modern", sectional: true, art: "abstract", lamp: "#ffd9a0", sky: "night" });
      walls({ default: "#e8e0d4" });
      floors({ default: ["wood", "#7a5a40", "#000"], bedroom: ["wood", "#7a5a40", "#000"], kitchen: ["marble", "#efebe4", "#b8b0a2"] });
      break;
    case "lux":
      Object.assign(th, { fabric: "#ece6dc", fabric2: "#d9cfc0", accent: F.mix(a, "#c9b8a0", 0.5), rug: "#e2dacb", cove: true, sectional: true, piano: true, fireplace: "modern", sky: "dusk" });
      walls({ default: "#f3f0ea" });
      floors({ default: ["marble", "#ece8e1", "#c4bcb0"], bedroom: ["wood", "#a07850", "#000"] });
      break;
    case "marble":
      Object.assign(th, { fabric: "#f6f4ef", fabric2: "#ebe6dd", accent: "#e6ddcf", accent2: "#d8cbb5", rug: "#ece6da", cove: true, modular: true, fireplace: "modern", columns: true, skylight: true, plants: ["palm", "bird"], view: "garden", sky: "dusk", metal: "#c9b27a", cabinet: "#f4f1ea" });
      walls({ default: "#f5f3ee", greatRoom: { kind: "marble", hex: "#f3f1ec", alt: "#cfc8bc" } });
      floors({ default: ["marble", "#f4f2ee", "#c9c2b6"], bedroom: ["marble", "#efebe5", "#c9c2b6"], bath: ["marble", "#f4f2ee", "#b8b0a4"] });
      th.edge = "glass";
      break;
    case "stone":
      Object.assign(th, { fabric: "#d9d6d0", fabric2: "#3a3d44", accent: "#c9b27a", accent2: "#5a5f66", rug: "#c9c4bb", cove: true, sectional: true, fireplace: "modern", cabinet: "#2a2c31", counterTop: "#e6e3de", mullion: "#111216", sky: "dusk", view: "garden", glass: "#9fb6c4", glassAlpha: 0.32 });
      walls({ default: "#e9e6e1" });
      floors({ default: ["marble", "#d9d6d0", "#9a958c"], bedroom: ["wood", "#6b5038", "#000"] });
      break;
    case "beach":
    case "villa":
      Object.assign(th, { wood: "#d9bf98", woodDark: "#a07a52", fabric: "#fbf9f4", fabric2: "#e9dcc4", accent: "#3ec6c0", accent2: "#8fe3e0", rug: "#efe6d4", vase: "#c9b28c", sofaWood: true, art: "palm", plants: ["bird", "palm"], view: "beach", headboard: "#e9dcc4", duvet: "#ffffff", cabinet: "#f7f5f0", pot: "#e9dcc4", towel: "#8fe3e0", metal: "#c9b28c", edge: fam === "villa" ? "glass" : "wood" });
      walls({ default: "#fbfaf6", kidsRoom: "#e3f4f6", bathroom: "#eef8f8" });
      floors({ default: ["wood", "#e2cfae", "#000"], bedroom: ["wood", "#e2cfae", "#000"], bath: ["tile", "#f1ede4", "#d9d0c0"], out: ["deck", "#c9a77c", "#000"], yard: ["sand", "#efe2c2", "#000"] });
      th.beams = fam === "villa";
      break;
    case "cozy":
      Object.assign(th, { fabric: F.mix(a, "#c9a27a", 0.4), fabric2: "#c98f5a", rug: F.mix(a, "#efe2cf", 0.6), fireplace: "classic", plants: ["fiddle", "small"], art: "abstract" });
      walls({ default: F.mix(w, "#ffffff", 0.4), bedroom: F.mix(a, "#ffffff", 0.7) });
      floors({ default: ["wood", "#b98a5e", "#000"] });
      break;
    case "loft":
      Object.assign(th, { fabric: "#7a4e2d", fabric2: "#3b2b2b", accent: a, rug: "#c9b8a0", metal: "#2a2c31", cabinet: "#2f2f33", art: "abstract", piano: false });
      walls({ default: { kind: "brick", hex: "#a34d36", alt: "#d8cfc0" }, bathroom: "#eeeae4" });
      floors({ default: ["wood", "#6b4a32", "#000"], bedroom: ["wood", "#6b4a32", "#000"] });
      break;
    case "gamer":
      Object.assign(th, { fabric: "#2b2440", fabric2: "#1b1630", accent: style.trim, accent2: style.window, rug: "#3a3354", cabinet: "#1f1a30", counterTop: "#2b2440", counterVein: "#59f3ff", bedFrame: "#1b1630", headboard: "#3a3354", duvet: "#2b2440", screen: "#2a1f5a", neon: true, lamp: "#c9b8ff", ceiling: "#1f1a30", baseboard: style.trim });
      walls({ default: "#2b2440", bathroom: "#3a3354" });
      floors({ default: ["wood", "#3a3354", "#000"], bedroom: ["carpet", "#2b2440", "#000"], kitchen: ["tile", "#2b2440", "#1b1630"] });
      th.sky = "night";
      break;
    case "grand":
      Object.assign(th, { fabric: "#fff3dc", fabric2: "#c8102e", accent: "#c8102e", accent2: "#d4a017", metal: "#d4a017", rug: "#c8102e", crystal: true, trim: "#d4a017", piano: true });
      walls({ default: "#fff3dc", bathroom: "#f7efe0" });
      floors({ default: ["marble", "#f3e9d6", "#c9b48a"], bedroom: ["carpet", "#e9d9b8", "#000"] });
      break;
    case "space":
      Object.assign(th, { fabric: "#e8eef5", fabric2: "#9b8cff", accent: "#5b4dff", accent2: "#9b8cff", rug: "#2a2f55", cabinet: "#e8eef5", counterTop: "#c9d3df", screen: "#2a1f5a", lamp: "#bfe6ff", stars: true, portholes: true, neon: true, duvet: "#e8eef5", headboard: "#c9d3df" });
      walls({ default: { kind: "panel", hex: "#d9e0ea", alt: "#5b4dff" } });
      floors({ default: ["panel", "#2a2f4a", "#7cf2ff"], bedroom: ["carpet", "#2a2f55", "#000"], bath: ["tile", "#e8eef5", "#9aa6b8"] });
      th.sky = "night";
      break;
    case "jungle":
      Object.assign(th, { fabric: "#d6c4a0", fabric2: "#5d9e57", accent: "#ffd23f", accent2: "#e98a3a", rug: "#c9b48a", leaf: "#3f8a3a", plants: ["palm", "bird", "fiddle"], vines: true, sofaWood: true, art: "palm" });
      walls({ default: "#e2eed8", bathroom: "#d8ead0" });
      floors({ default: ["wood", "#a77a4e", "#000"] });
      th.view = "garden";
      break;
    case "candy":
      Object.assign(th, { fabric: "#ffb7d5", fabric2: "#7ee0c3", accent: "#ff6fa5", accent2: "#7ee0c3", rug: "#fff0f6", cabinet: "#ffe0ef", counterTop: "#ffffff", duvet: "#ffe0ef", headboard: "#ff9cc6", candy: true, lamp: "#ffd6ea" });
      walls({ default: { kind: "stripes", hex: "#ffd0e4", alt: "#fff6fa" }, bathroom: "#e0fff6", kitchen: "#fff0f6" });
      floors({ default: ["tile", "#ffe0ef", "#ffffff"], bedroom: ["carpet", "#ffd6ea", "#000"] });
      break;
    case "ice":
      Object.assign(th, { fabric: "#ffffff", fabric2: "#bfe9ff", accent: "#7ec8ee", accent2: "#d7f3ff", rug: "#ffffff", cabinet: "#eaf8ff", counterTop: "#ffffff", duvet: "#ffffff", headboard: "#d7f3ff", icicles: true, lamp: "#e0f6ff" });
      walls({ default: "#e3f6ff" });
      floors({ default: ["marble", "#f2fbff", "#bfe0f0"], bedroom: ["carpet", "#ffffff", "#000"] });
      break;
    case "cottage":
      Object.assign(th, { fabric: "#f3e3d0", fabric2: "#e98aa0", accent: "#e98aa0", accent2: "#8fbf7a", rug: "#efe0d0", fireplace: "classic", cabinet: "#f4efe4", plants: ["small", "fiddle"], view: "garden", edge: "fence" });
      walls({ default: "#f6efe2", bedroom: "#fbe8ec", kidsRoom: "#e8f4e0" });
      floors({ default: ["wood", "#b88a5a", "#000"] });
      break;
    case "farm":
      Object.assign(th, { fabric: "#e9dfcc", fabric2: "#b8382f", accent: "#b8382f", accent2: "#ffd23f", rug: "#d9c8a8", fireplace: "stone", cabinet: "#fff6ea", view: "garden", edge: "fence", sofaWood: false });
      walls({ default: { kind: "slats", hex: "#fbf6ec", alt: "#000" }, bathroom: "#f4efe4" });
      floors({ default: ["wood", "#a8743e", "#000"] });
      break;
    case "spooky":
      Object.assign(th, { fabric: "#4b3a5e", fabric2: "#241a33", accent: "#ff8a1f", accent2: "#b6ff6a", rug: "#3a2a44", cabinet: "#2e2438", counterTop: "#3a2f45", bedFrame: "#241a33", headboard: "#4b3a5e", duvet: "#5a4a6e", fireplace: "classic", mantel: "#2e2438", spooky: true, lamp: "#d9ff9a", ceiling: "#2a2133", baseboard: "#241a33", view: "garden", sky: "night", edge: "fence" });
      walls({ default: "#3e3150", bathroom: "#4b3a5e" });
      floors({ default: ["wood", "#4a3a2c", "#000"], bedroom: ["wood", "#4a3a2c", "#000"] });
      break;
    case "modern":
      Object.assign(th, { cove: true, sectional: true, view: style.type === "house" ? "garden" : "city", edge: style.type === "house" ? "fence" : "glass" });
      walls({ default: F.mix(w, "#ffffff", 0.75) });
      break;
    case "garden":
      Object.assign(th, { leaf: "#4f9a4a", plants: ["fiddle", "bird", "palm", "snake"], vines: true, cove: true, sectional: true, sky: "dusk" });
      walls({ default: "#eef3ea" });
      break;
    case "aquarium":
      Object.assign(th, { fabric: "#e8f4fa", fabric2: "#5bb8e6", accent: "#ff8a3d", accent2: "#5bb8e6", rug: "#d6ecf5", aquarium: true, cove: true, lamp: "#bfefff", sky: "dusk" });
      walls({ default: "#e3f2f8" });
      floors({ default: ["marble", "#eef7fb", "#a8cfe0"] });
      break;
    case "castle":
      Object.assign(th, { fabric: "#7a1f2b", fabric2: "#5a3a22", accent: "#c8384a", accent2: "#d4a017", metal: "#3a3a40", rug: "#8a1f2e", wood: "#6b4a32", cabinet: "#5a3a22", counterTop: "#9a9286", fireplace: "stone", crystal: true, castle: true, bedFrame: "#4a2e1a", headboard: "#7a1f2b", duvet: "#8a1f2e", trim: "#6e665a", door: "#5a3a22", baseboard: "#6e665a", ceiling: "#d8d0c0", view: "garden", edge: "stone" });
      walls({ default: { kind: "stone", hex: "#b9b2a6", alt: "#000" }, dungeon: { kind: "stone", hex: "#7a7468", alt: "#000" } });
      floors({ default: ["stone", "#8d7f6c", "#000"], bedroom: ["wood", "#6b4a32", "#000"] });
      break;
    case "lodge":
      Object.assign(th, { fabric: "#7a4e2d", fabric2: "#c8384a", accent: "#c8384a", accent2: "#3f6b3a", rug: "#8a2f2a", fireplace: "stone", cabinet: "#8a5a3a", lodge: true, view: "garden", edge: "wood", plants: ["fiddle"] });
      walls({ default: { kind: "logs", hex: "#9c6a3f", alt: "#000" }, bathroom: "#e9dfcc" });
      floors({ default: ["wood", "#8a5a36", "#000"] });
      break;
    case "hollywood":
      Object.assign(th, { fabric: "#fff3dc", fabric2: "#c8102e", accent: "#c8102e", accent2: "#d4a017", metal: "#d4a017", rug: "#c8102e", crystal: true, piano: true, hollywood: true, cove: true, trim: "#d4a017", velvet: "#a0101e", sky: "dusk", fireplace: "modern" });
      walls({ default: "#fff6e6", movieRoom: "#3a0d14" });
      floors({ default: ["marble", "#f6efe0", "#d4b870"], bedroom: ["carpet", "#efe0c4", "#000"] });
      break;
    case "tree":
      Object.assign(th, { fabric: "#d6c4a0", fabric2: "#5d9e57", accent: "#7dcea0", accent2: "#ffd23f", rug: "#c9b48a", leaf: "#4f8a3a", vines: true, sofaWood: true, cabinet: "#a77a4e", plants: ["fiddle", "palm"], view: "garden", edge: "wood", treehouse: true });
      walls({ default: { kind: "logs", hex: "#a77a4e", alt: "#000" }, bathroom: "#e8f0de" });
      floors({ default: ["wood", "#b8895a", "#000"] });
      break;
    case "hillside":
      Object.assign(th, { fabric: "#f4f1ea", fabric2: "#d9bf98", accent: "#3ec6c0", accent2: "#e9c46a", rug: "#ece6da", sectional: true, cove: true, plants: ["palm", "bird"], view: "garden", edge: "glass" });
      walls({ default: "#f8f6f1" });
      floors({ default: ["wood", "#d2b48c", "#000"], out: ["deck", "#c49a6c", "#000"] });
      break;
    default:
      break;
  }
  if (style.type === "mansion" && !["castle", "lodge", "tree"].includes(fam)) th.piano = th.piano || fam === "hollywood";
  return th;
}

function paintOf(th, room) {
  return th.walls[room.id] ?? th.walls[room.kind] ?? (room.kind === "bath" ? th.walls.bathroom : null) ?? th.walls.default;
}

function floorOf(th, room) {
  if (room.floor) return room.floor;
  if (room.out) return room.yard ? th.floors.yard : th.floors.out;
  const map = { bath: "bath", kitchen: "kitchen", bedroom: "bedroom", kids: "bedroom", garage: "garage", gym: "gym", movie: "movie" };
  return th.floors[map[room.kind]] ?? th.floors.default;
}

/* ------------------------------------------------------------------ layouts */

const room = (id, kind, name, lv, x0, z0, x1, z1, o = {}) => ({ id, kind, name, lv, x0, z0, x1, z1, ...o });
const door = (lv, axis, line, c, w, o = {}) => ({ lv, axis, line, c, w, h: DOOR_H, ...o });

function apartmentLayout(th) {
  const curve = th.curve;
  return {
    lift: 46,
    levels: [{ y: 0, h: 2.8 }],
    rooms: [
      room("living", "living", "living", 0, -7, -5, 1, 1.5, curve ? { curve: { side: "x0", sag: 2.4 } } : {}),
      room("kitchen", "kitchen", "kitchen", 0, -7, 1.5, 1, 5),
      room("bedroom", "bedroom", "bedroom", 0, 1, 0.2, 6.5, 5),
      room("bath", "bath", "bathroom", 0, 1, -5, 6.5, 0.2),
      room("balcony", "balcony", "balcony", 0, -5.5, -7, 0.5, -5, { out: true }),
    ],
    doors: [
      door(0, "x", 1.5, -3.5, 5.6, { kind: "open", h: 2.8 }),
      door(0, "z", 6.5, 2.6, 1.0, { exit: true }),
      door(0, "z", 1, 0.85, 0.95),
      door(0, "z", 1, -1.6, 0.9),
      door(0, "x", -5, -2.5, 1.8, { kind: "glass" }),
    ],
    glass: curve ? { living: ["z0"] } : { living: ["z0", "x0"] },
  };
}

function nightLoftLayout() {
  return {
    lift: 120,
    levels: [{ y: 0, h: 3.0 }, { y: 3.25, h: 2.8 }],
    rooms: [
      room("living", "living", "living", 0, -8, -6, 2, 4, { tall: true }),
      room("kitchen", "kitchen", "kitchen", 0, 2, -1, 11, 4),
      room("foyer", "hall", "foyer", 0, 2, -6, 11, -1),
      room("mezz", "mezzanine", "mezzanine", 1, 2, -6, 11, -1),
      room("loft", "bedroom", "loft", 1, 2, -1, 8, 4),
      room("bath", "bath", "bathroom", 1, 8, -1, 11, 4),
    ],
    doors: [
      door(0, "z", 2, 1.5, 4, { kind: "open", h: 3.0 }),
      door(0, "z", 2, -3.5, 2.4, { kind: "open", h: 3.0 }),
      door(0, "x", -6, 6.5, 1.1, { exit: true, elevator: true }),
      door(0, "x", -1, 8, 2.4, { kind: "open", h: 3.0 }),
      door(1, "z", 2, -1, 10, { kind: "rail", skip: [[-4.3, -2.7]] }),
      door(1, "x", -1, 5, 1.0),
      door(1, "z", 8, 1.5, 0.9),
    ],
    stairs: [{ lv: 0, kind: "floating", w: 1.25, arc: { cx: 2.0, cz: -0.5, r: 3.0, a0: -Math.PI / 2, a1: -Math.PI }, rails: "both" }],
    glass: { living: ["x0", "z1"] },
  };
}

function hotelLayout() {
  return {
    lift: 60,
    levels: [{ y: 0, h: 2.9 }],
    rooms: [
      room("corridor", "hall", "hallway", 0, -9, -8, 9, -5.6),
      room("sitting", "living", "sitting", 0, -9, -5.6, 0, 1),
      room("bedroom", "bedroom", "bedroom", 0, -9, 1, 0, 6),
      room("bath", "bath", "bathroom", 0, 0, 1, 5, 6),
      room("dining", "roomService", "roomService", 0, 0, -5.6, 5, 1),
      room("deck", "poolDeck", "poolDeck", 0, 5, -5.6, 13, 6, { out: true }),
    ],
    doors: [
      door(0, "z", -9, -6.8, 1.2, { exit: true }),
      door(0, "x", -5.6, -6, 1.0, { suite: true }),
      door(0, "x", 1, -4.5, 1.6),
      door(0, "z", 0, 3.5, 0.9),
      door(0, "z", 0, -2.3, 2.4, { kind: "open", h: 2.9 }),
      door(0, "z", 5, -2.3, 2.0, { kind: "glass" }),
    ],
    pools: [{ lv: 0, x0: 6.6, z0: -3.4, x1: 11.6, z1: 4.6, depth: 1.6, steps: "z0" }],
    glass: { sitting: ["x0"], bedroom: ["x0"] },
    elevator: {
      x0: 7.0, z0: -7.9, x1: 8.9, z1: -5.7,
      stops: [
        { y: -60, side: "x0", label: "L", nameKey: "lift.lobby" },
        { y: 0, side: "x0", label: "20", nameKey: "lift.suite", start: true },
        { y: 3.2, side: "x0", label: "R", nameKey: "lift.roof" },
      ],
    },
    lobby: { y: -60, x0: -3, z0: -8, x1: 9, z1: -0.5, exit: 1.5, exitW: 2.4 },
    roof: {
      y: 3.2, under: 2.9,
      rects: [[-9, -8, 5, 6], [5, -8, 9, -5.6]],
      edges: [[-9, -8, 9, -8], [9, -8, 9, -5.6], [5, -5.6, 9, -5.6], [5, -5.6, 5, 6], [-9, 6, 5, 6], [-9, -8, -9, 6]],
    },
  };
}

function houseLayout(th) {
  return {
    lift: 0,
    levels: [{ y: 0, h: 2.8 }, { y: 3.05, h: 2.7 }],
    rooms: [
      room("living", "living", "living", 0, -9, -6, -1, 1),
      room("dining", "dining", "dining", 0, -1, -6, 9, 1),
      room("hall", "hall", "hallway", 0, -5, 1, 3, 6),
      room("bath0", "bath", "bathroom", 0, -9, 1, -5, 6),
      room("kitchen", "kitchen", "kitchen", 0, 3, 1, 9, 6),
      room("garage", "garage", "garage", 0, 9, 0, 15, 6),
      room("yard", "backyard", "backyard", 0, -9, 6, 15, 16, { out: true, yard: true }),
      room("hall1", "hall", "hallway", 1, -5, 1, 3, 6),
      room("main", "bedroom", "mainBedroom", 1, -9, -6, -1, 1, { main: true }),
      room("bed2", "bedroom", "bedroom", 1, -1, -6, 4, 1),
      room("ensuite", "bath", "bathroom", 1, 4, -6, 9, 1),
      room("kids", "kids", "kidsRoom", 1, 3, 1, 9, 6),
      room("bath1", "bath", "bathroom", 1, -9, 1, -5, 6),
      room("balcony", "balcony", "balcony", 1, -8.5, -7.8, -1.5, -6, { out: true }),
    ],
    doors: [
      door(0, "x", -6, -5, 1.0, { exit: true }),
      door(0, "z", -1, -2.5, 2.6, { kind: "open", h: 2.8 }),
      door(0, "x", 1, -3, 1.1),
      door(0, "z", -5, 2.3, 0.9),
      door(0, "z", 3, 2.3, 1.0),
      door(0, "x", 1, 6, 2.4, { kind: "open", h: 2.8 }),
      door(0, "x", 6, 6, 1.8, { kind: "glass" }),
      door(0, "z", 9, 3.5, 1.0),
      door(1, "x", 1, -3, 1.0),
      door(1, "x", 1, 1.8, 1.0),
      door(1, "z", 4, -2.5, 0.9),
      door(1, "z", 3, 2.3, 1.0),
      door(1, "z", -5, 2.3, 0.9),
      door(1, "x", -6, -5, 1.6, { kind: "glass" }),
    ],
    holes: [{ lv: 1, x0: -3.5, z0: 4.5, x1: 1.75, z1: 6 }],
    stairs: [{ lv: 0, kind: th.fam === "castle" ? "solid" : "floating", w: 1.2, from: [-3.4, 5.25], to: [1.65, 5.25], rails: "right" }],
    rails: [{ lv: 1, a: [-3.5, 4.5], b: [1.75, 4.5] }, { lv: 1, a: [-3.5, 4.5], b: [-3.5, 6] }],
    glass: th.fam === "modern" ? { living: ["z0"], kitchen: ["z1"] } : {},
  };
}

function penthouseLayout() {
  return {
    lift: 64,
    levels: [{ y: 0, h: 3.2 }, { y: 3.45, h: 3.0 }],
    rooms: [
      room("living", "living", "living", 0, -10, -8, 1, 2, { tall: true }),
      room("foyer", "hall", "foyer", 0, 1, -8, 10, -4),
      room("kitchen", "kitchen", "kitchen", 0, 1, -4, 10, 2),
      room("dining", "dining", "dining", 0, -4, 2, 1, 8),
      room("game", "game", "gameRoom", 0, -10, 2, -4, 8),
      room("guest", "bedroom", "guestBedroom", 0, 1, 2, 6, 8),
      room("guestBath", "bath", "bathroom", 0, 6, 2, 10, 8),
      room("mezz", "mezzanine", "mezzanine", 1, -4, 2, 4, 8),
      room("main", "bedroom", "mainBedroom", 1, -10, 2, -4, 8, { main: true }),
      room("mainBath", "bath", "bathroom", 1, 4, 2, 10, 8),
      room("terrace", "terrace", "terrace", 1, 1, -8, 10, 2, { out: true }),
    ],
    doors: [
      door(0, "x", -8, 5.9, 1.2, { exit: true }),
      door(0, "z", 1, -6, 2.2, { kind: "open", h: 3.2 }),
      door(0, "z", 1, -1, 4, { kind: "open", h: 3.2 }),
      door(0, "x", -4, 5.5, 2.4, { kind: "open", h: 3.2 }),
      door(0, "x", 2, -3, 2.0, { kind: "open", h: 3.2 }),
      door(0, "x", 2, -7, 1.1),
      door(0, "x", 2, 3.5, 1.0),
      door(0, "z", 6, 5, 0.9),
      door(1, "x", 2, -1.5, 5, { kind: "rail", skip: [[-1.95, -0.35]] }),
      door(1, "x", 2, 2.5, 1.8, { kind: "glass" }),
      door(1, "z", -4, 5, 1.0),
      door(1, "z", 4, 5, 0.9),
    ],
    stairs: [{ lv: 0, kind: "floating", w: 1.3, from: [-1.15, -3.0], to: [-1.15, 2.0], rails: "both" }],
    glass: { living: ["x0", "z0"], main: ["x0", "z1"], mezz: ["z1"] },
    hottub: { lv: 1, x: 8.6, z: -0.6 },
    elevator: {
      x0: 7.95, z0: -7.9, x1: 9.9, z1: -5.95,
      stops: [
        { y: -64, side: "z1", label: "L", nameKey: "lift.lobby" },
        { y: 0, side: "z1", label: "PH", nameKey: "lift.penthouse", start: true },
        { y: 3.45, side: "z1", label: "R", nameKey: "lift.terrace" },
      ],
    },
    lobby: { y: -64, x0: 0, z0: -8, x1: 11, z1: -1, exit: 5.0, exitW: 1.8 },
  };
}

function mansionLayout(th, style) {
  const villa = th.fam === "villa";
  const castle = th.fam === "castle";
  const marble = th.fam === "marble";
  const hillside = th.fam === "hillside";
  return {
    lift: 0,
    levels: [{ y: 0, h: 3.4 }, { y: 3.7, h: 3.1 }],
    rooms: [
      room("entrance", "entrance", "entrance", 0, -5, -10, 5, 1, { tall: true }),
      room("living", "living", marble ? "greatRoom" : "living", 0, -16, -4, -5, 10, { tall: true }),
      room("dining", "dining", "dining", 0, -16, -10, -5, -4),
      room("kitchen", "kitchen", "kitchen", 0, -5, 1, 5, 10),
      room("movie", "movie", "movieRoom", 0, 5, -10, 16, -3),
      room("game", castle ? "dungeon" : "game", castle ? "dungeon" : "gameRoom", 0, 5, -3, 13.6, 4),
      room("liftHall", "hall", "hallway", 0, 13.6, -3, 16, 4),
      room("powder", "bath", "bathroom", 0, 5, 4, 9, 10),
      room("gym", "gym", "gym", 0, 9, 4, 16, 10),
      room("garage", "garage", "garage", 0, 16, -3, 24, 6),
      room("deck", "poolDeck", "poolDeck", 0, -16, 10, 24, 25, { out: true }),
      room("gallery", "gallery", "gallery", 1, -5, 1, 5, 4),
      room("main", "bedroom", "mainBedroom", 1, -5, 4, 2, 10, { main: true }),
      room("mainBath", "bath", "bathroom", 1, 2, 4, 5, 10),
      room("hall1", "hall", "hallway", 1, 5, 0, 16, 2.5),
      room("bed2", "bedroom", "bedroom", 1, 5, -10, 16, 0),
      room("bed3", "kids", "kidsRoom", 1, 5, 2.5, 11, 10),
      room("bath2", "bath", "bathroom", 1, 11, 2.5, 16, 10),
      room("balcony", "balcony", "balcony", 1, -5, 10, 2, 12, { out: true }),
    ],
    doors: [
      door(0, "x", -10, 0, 1.8, { exit: true, double: true }),
      door(0, "z", -5, -2, 2.4, { kind: "open", h: 3.4 }),
      door(0, "z", -5, -7, 1.6),
      door(0, "x", -4, -10.5, 3, { kind: "open", h: 3.4 }),
      door(0, "z", -5, 6, 3, { kind: "open", h: 3.4 }),
      door(0, "x", 1, -3, 2, { kind: "open", h: 3.4 }),
      door(0, "z", 5, -7, 1.2),
      door(0, "z", 5, -1, 1.2, castle ? { secret: true } : {}),
      door(0, "z", 5, 7, 0.9),
      door(0, "x", 4, 12.5, 1.2),
      door(0, "z", 16, -1.6, 1.2),
      door(0, "z", 13.6, -1.6, 1.6, { kind: "open", h: 2.8 }),
      door(0, "x", 10, -10.5, villa ? 7 : 3, { kind: villa ? "beam" : "glass", h: villa ? 3.4 : DOOR_H + 0.3 }),
      door(0, "x", 10, 2, 1.8, { kind: "glass" }),
      door(1, "x", 1, 0, 10, { kind: "rail", skip: [[-1.3, 1.3]] }),
      door(1, "z", -5, 2.5, 3, { kind: "rail" }),
      door(1, "x", 4, -3, 1.0),
      door(1, "z", 2, 7, 0.9),
      door(1, "z", 5, 1.8, 1.1),
      door(1, "x", 0, 10.5, 1.0),
      door(1, "x", 2.5, 8, 1.0),
      door(1, "x", 2.5, 12.5, 0.9),
      door(1, "x", 10, -1.5, 1.8, { kind: "glass" }),
      ...(th.fam === "hillside" ? [door(1, "x", 12, -3.6, 1.1, { kind: "none" })] : []),
    ],
    slide: th.fam === "hillside" ? { from: [-3.6, 12.0], to: [-3.6, 16.2], top: 3.7, bottom: 0.45, w: 1.0 } : null,
    stairs: [{ lv: 0, kind: castle || style.id === "man-lodge" ? "solid" : "floating", w: 2.4, from: [0, -4.9], to: [0, 1.0], rails: "both" }],
    pools: [{ lv: 0, x0: -9, z0: 14, x1: 9, z1: 20, depth: 1.8, steps: "x0", infinity: "z1" }],
    glass: { living: ["x0", "z1"], main: ["z1"], entrance: villa || marble || th.fam === "stone" || th.fam === "lux" ? ["z0"] : [] },
    elevator: {
      x0: 13.9, z0: 0.4, x1: 15.85, z1: 2.35,
      stops: [
        { y: 0, side: "z0", label: "1", nameKey: "lift.ground", start: true },
        { y: 3.7, side: "x0", label: "2", nameKey: "lift.upper" },
        ...(hillside ? [{ y: 7.1, side: "x0", label: "R", nameKey: "lift.topDeck" }] : []),
      ],
    },
    roof: hillside ? { y: 7.1, under: 6.8, rects: [[5, -10, 16, 10]], edges: [[5, -10, 16, -10], [16, -10, 16, 10], [5, 10, 16, 10], [5, -10, 5, 10]] } : null,
  };
}

function layoutFor(style, th) {
  if (style.id === "apt-night") return nightLoftLayout(th);
  switch (style.type) {
    case "hotel":
      return hotelLayout(th);
    case "house":
      return houseLayout(th);
    case "penthouse":
      return penthouseLayout(th);
    case "mansion":
      return mansionLayout(th, style);
    default:
      return apartmentLayout(th);
  }
}

/* ------------------------------------------------------------------ geometry helpers */

function subtract(rect, hole) {
  const [x0, z0, x1, z1] = rect;
  const [hx0, hz0, hx1, hz1] = hole;
  if (hx0 >= x1 || hx1 <= x0 || hz0 >= z1 || hz1 <= z0) return [rect];
  const out = [];
  if (hz0 > z0) out.push([x0, z0, x1, hz0]);
  if (hz1 < z1) out.push([x0, hz1, x1, z1]);
  const mz0 = Math.max(z0, hz0);
  const mz1 = Math.min(z1, hz1);
  if (hx0 > x0) out.push([x0, mz0, hx0, mz1]);
  if (hx1 < x1) out.push([hx1, mz0, x1, mz1]);
  return out.filter((r) => r[2] - r[0] > EPS && r[3] - r[1] > EPS);
}

function subtractAll(rects, holes) {
  let out = rects;
  for (const hole of holes) out = out.flatMap((r) => subtract(r, hole));
  return out;
}

function cutIntervals(intervals, cuts) {
  let out = intervals;
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.02);
}

const near = (a, b) => Math.abs(a - b) < 0.01;
const overlaps = (a, b) => a[0] < b[2] - EPS && a[2] > b[0] + EPS && a[1] < b[3] - EPS && a[3] > b[1] + EPS;

/* ------------------------------------------------------------------ builder */

/**
 * Builds a home's interior at `origin` (world position of the layout's 0,0,0 before the lift).
 * Returns { spawn, door, update(time, foot) -> room name key when it changes, dispose() }.
 */
export function buildInterior(scene, { mats, style, low = false, origin }) {
  const th = themeFor(style);
  const L = layoutFor(style, th);
  const fin = F.finishes(scene);
  const base = new Vector3(origin.x, origin.y + (L.lift ?? 0), origin.z);
  const root = new TransformNode("city-interior", scene);
  root.position.copyFrom(base);
  const shellNode = new TransformNode("ci-shell", scene);
  shellNode.parent = root;
  const furnNode = new TransformNode("ci-furn", scene);
  furnNode.parent = root;
  const animNode = new TransformNode("ci-anim", scene);
  animNode.parent = root;
  const holder = new TransformNode("ci-mesh", scene);
  const S = createKit(scene, shellNode, mats);
  const K = createKit(scene, furnNode, mats);
  const A = createKit(scene, animNode, mats);
  const container = new PhysicsShapeContainer(scene);
  const shapes = [];
  const animators = [];
  const lights = [];
  const waters = [];
  const extra = [];
  const flames = [];
  let secret = null;

  const levels = L.levels;
  const rooms = L.rooms.map((r) => {
    const lvl = levels[r.lv];
    const next = levels[r.lv + 1];
    const h = r.tall && next ? next.y + next.h - lvl.y : lvl.h;
    return { ...r, y: lvl.y, h, windows: [], glassFaces: new Set(L.glass?.[r.id] ?? []), occ: [], tallSpans: [], meta: ROOM_NAMES[r.name] ?? ROOM_NAMES.living };
  });
  const doors = L.doors.map((d) => ({ h: DOOR_H, ...d }));
  for (const r of rooms) {
    if (!r.curve) continue;
    const side = r.curve.side;
    const axis = side[0] === "x" ? "z" : "x";
    const line = side === "x0" ? r.x0 : side === "x1" ? r.x1 : side === "z0" ? r.z0 : r.z1;
    const [a, b] = axis === "z" ? [r.z0, r.z1] : [r.x0, r.x1];
    doors.push({ lv: r.lv, axis, line, c: (a + b) / 2, w: b - a, h: r.h, kind: "none" });
  }
  const holes = (L.holes ?? []).map((h) => ({ ...h, r: [h.x0, h.z0, h.x1, h.z1] }));
  const pools = (L.pools ?? []).map((p) => ({ ...p, r: [p.x0, p.z0, p.x1, p.z1] }));
  // The elevator shaft cuts every floor it stops at and every ceiling it rises through.
  const shaft = L.elevator ? { r: [L.elevator.x0, L.elevator.z0, L.elevator.x1, L.elevator.z1], lo: Math.min(...L.elevator.stops.map((s) => s.y)), hi: Math.max(...L.elevator.stops.map((s) => s.y)) } : null;
  const floorCut = (y) => (shaft && y > shaft.lo - 0.01 && y < shaft.hi + 0.01 ? [shaft.r] : []);
  const ceilCut = (y) => (shaft && y > shaft.lo - 0.01 && y < shaft.hi - 0.01 ? [shaft.r] : []);
  const inShaft = (x, z, pad = 0) => Boolean(shaft) && x > shaft.r[0] - pad && x < shaft.r[2] + pad && z > shaft.r[1] - pad && z < shaft.r[3] + pad;

  const box = (x, y, z, w, h, d, rotation, swap = false) => {
    const size = swap ? new Vector3(d, h, w) : new Vector3(w, h, d);
    const shape = new PhysicsShapeBox(new Vector3(x, y, z), rotation ?? Quaternion.Identity(), size, scene);
    shape.material = { friction: 0.9, restitution: 0 };
    container.addChild(shape);
    shapes.push(shape);
  };
  const solidRect = (r, y0, y1) => box((r[0] + r[2]) / 2, (y0 + y1) / 2, (r[1] + r[3]) / 2, r[2] - r[0], y1 - y0, r[3] - r[1]);

  /** A shell piece: a plain color, or { kind, hex, alt } for a tiling finish. */
  const sbox = (w, h, d, x, y, z, look, o) => {
    if (w <= EPS || h <= EPS || d <= EPS) return null;
    if (look && typeof look === "object") {
      const mesh = F.tiledBox(scene, w, h, d, fin.get(look.kind, look.hex, look.alt ?? "#000"), look.size ?? F.FINISH_SIZE[look.kind] ?? 1);
      mesh.parent = shellNode;
      mesh.position.set(x, y, z);
      if (o?.ry) mesh.rotation.y = o.ry;
      return mesh;
    }
    return S.box(w, h, d, x, y, z, look, o);
  };
  const glassMat = mats.get(th.glass, 0.06, th.glassAlpha);
  const glass = (w, h, d, x, y, z, o = {}) => S.box(w, h, d, x, y, z, null, { ...o, material: glassMat });

  const ctx = {
    scene,
    k: K,
    a: A,
    fin,
    th,
    low,
    ceil: 2.8,
    solid(x, y, z, w, h, d, yaw = 0) {
      if (Math.abs(Math.sin(yaw * 2)) > 1e-3) box(x, y, z, w, h, d, Quaternion.RotationYawPitchRoll(yaw, 0, 0));
      else box(x, y, z, w, h, d, undefined, Math.abs(Math.sin(yaw)) > 0.5);
    },
  };

  /* -------- walls */
  const sideName = (axis, room, line) => (axis === "x" ? (near(room.z0, line) ? "z0" : "z1") : near(room.x0, line) ? "x0" : "x1");

  function wallHalves(axis, line, p, q, y0, y1, minusLook, plusLook) {
    const len = q - p;
    const c = (p + q) / 2;
    const h = y1 - y0;
    const yc = (y0 + y1) / 2;
    for (const [side, look] of [[-1, minusLook], [1, plusLook]]) {
      const off = (side * T) / 4;
      if (axis === "x") sbox(len, h, T / 2, c, yc, line + off, look);
      else sbox(T / 2, h, len, line + off, yc, c, look);
    }
  }

  function baseboard(axis, line, p, q, y0, side) {
    const off = side * (T / 2 + 0.008);
    if (axis === "x") S.box(q - p, 0.09, 0.016, (p + q) / 2, y0 + 0.045, line + off, th.baseboard);
    else S.box(0.016, 0.09, q - p, line + off, y0 + 0.045, (p + q) / 2, th.baseboard);
  }

  function emitWalls() {
    levels.forEach((lvl, li) => {
      const top = levels[li + 1] ? levels[li + 1].y : lvl.y + lvl.h;
      const present = rooms.filter((r) => r.lv === li || (r.tall && r.lv === li - 1));
      for (const axis of ["x", "z"]) {
        const lines = new Map();
        for (const r of present) {
          const [a, b] = axis === "x" ? [r.x0, r.x1] : [r.z0, r.z1];
          const [lo, hi] = axis === "x" ? [r.z0, r.z1] : [r.x0, r.x1];
          for (const [line, side] of [[lo, 1], [hi, -1]]) {
            const key = Math.round(line * 100);
            if (!lines.has(key)) lines.set(key, { line, edges: [] });
            lines.get(key).edges.push({ a, b, room: r, side });
          }
        }
        for (const { line, edges } of lines.values()) {
          const pts = [...new Set(edges.flatMap((e) => [e.a, e.b]))].sort((p, q) => p - q);
          const runs = [];
          for (let i = 0; i < pts.length - 1; i += 1) {
            const m = (pts[i] + pts[i + 1]) / 2;
            const minus = edges.find((e) => e.side === -1 && e.a < m && e.b > m)?.room ?? null;
            const plus = edges.find((e) => e.side === 1 && e.a < m && e.b > m)?.room ?? null;
            const last = runs[runs.length - 1];
            if (last && last.minus === minus && last.plus === plus && near(last.b, pts[i])) last.b = pts[i + 1];
            else runs.push({ a: pts[i], b: pts[i + 1], minus, plus });
          }
          for (const run of runs) {
            const inMinus = run.minus && !run.minus.out;
            const inPlus = run.plus && !run.plus.out;
            if (inMinus || inPlus) wallRun(li, axis, line, run, lvl, top);
            else if ((run.minus?.out ? 1 : 0) + (run.plus?.out ? 1 : 0) === 1) fenceRun(li, axis, line, run, run.minus ?? run.plus);
          }
        }
      }
    });
  }

  function wallRun(li, axis, line, run, lvl, top) {
    const y0 = lvl.y;
    const inMinus = run.minus && !run.minus.out;
    const inPlus = run.plus && !run.plus.out;
    const ext = inMinus !== inPlus;
    const inner = inMinus ? run.minus : run.plus;
    const innerSide = inMinus ? -1 : 1;
    const look = (r) => (r && !r.out ? paintOf(th, r) : th.ext);
    const minusLook = look(run.minus);
    const plusLook = look(run.plus);
    const myDoors = doors.filter((d) => d.lv === li && d.axis === axis && near(d.line, line) && d.c > run.a - 0.01 && d.c < run.b + 0.01);
    const gaps = myDoors.map((d) => [Math.max(run.a, d.c - d.w / 2), Math.min(run.b, d.c + d.w / 2), d]);
    const glassy = ext && inner.glassFaces.has(sideName(axis, inner, line));
    const pieces = cutIntervals([[run.a, run.b]], gaps);
    for (const [p0, q0] of pieces) {
      const p = near(p0, run.a) ? p0 - T / 2 : p0;
      const q = near(q0, run.b) ? q0 + T / 2 : q0;
      const c = (p + q) / 2;
      if (axis === "x") box(c, (y0 + top) / 2, line, q - p, top - y0, T);
      else box(line, (y0 + top) / 2, c, T, top - y0, q - p);
      if (glassy) curtainWall(axis, line, p0, q0, y0, top, inner, innerSide, li);
      else if (ext && q0 - p0 > 1.5) windowWall(axis, line, p, q, p0, q0, y0, top, lvl, inner, innerSide, minusLook, plusLook);
      else wallHalves(axis, line, p, q, y0, top, minusLook, plusLook);
      if (!glassy) {
        if (inMinus) baseboard(axis, line, p0, q0, y0, -1);
        if (inPlus) baseboard(axis, line, p0, q0, y0, 1);
      }
    }
    for (const [g0, g1, d] of gaps) doorway(axis, line, g0, g1, d, y0, top, lvl, minusLook, plusLook, run, inMinus, inPlus);
  }

  function windowWall(axis, line, p, q, p0, q0, y0, top, lvl, inner, innerSide, minusLook, plusLook) {
    const len = q0 - p0;
    const n = Math.max(1, Math.round(len / 3.2));
    const bath = inner.kind === "bath";
    const ww = Math.min(bath ? 1.0 : 1.8, len / n - 0.8);
    if (ww < 0.6) {
      wallHalves(axis, line, p, q, y0, top, minusLook, plusLook);
      return;
    }
    const sill = y0 + (bath ? 1.35 : inner.kind === "kitchen" ? 1.05 : 0.6);
    const head = y0 + Math.min(2.4, lvl.h - 0.3);
    let cursor = p;
    for (let i = 0; i < n; i += 1) {
      const c = p0 + (len * (i + 0.5)) / n;
      const w0 = c - ww / 2;
      const w1 = c + ww / 2;
      wallHalves(axis, line, cursor, w0, y0, top, minusLook, plusLook);
      wallHalves(axis, line, w0, w1, y0, sill, minusLook, plusLook);
      wallHalves(axis, line, w0, w1, head, top, minusLook, plusLook);
      windowUnit(axis, line, c, ww, sill, head, innerSide);
      inner.windows.push({ side: sideName(axis, inner, line), c, w: ww, sill, head });
      cursor = w1;
    }
    wallHalves(axis, line, cursor, q, y0, top, minusLook, plusLook);
  }

  function windowUnit(axis, line, c, ww, sill, head, innerSide) {
    const h = head - sill;
    const ym = (sill + head) / 2;
    const place = (along, across, w, hh, d, y, hex, o) => (axis === "x" ? S.box(w, hh, d, along, y, line + across, hex, o) : S.box(d, hh, w, line + across, y, along, hex, o));
    if (axis === "x") glass(ww, h, 0.02, c, ym, line);
    else glass(0.02, h, ww, line, ym, c);
    const fw = 0.05;
    place(c - ww / 2 + fw / 2, 0, fw, h, T + 0.02, ym, th.mullion);
    place(c + ww / 2 - fw / 2, 0, fw, h, T + 0.02, ym, th.mullion);
    place(c, 0, ww, fw, T + 0.02, head - fw / 2, th.mullion);
    place(c, 0, ww, fw, T + 0.02, sill + fw / 2, th.mullion);
    if (ww > 1.2) place(c, 0, 0.035, h, 0.06, ym, th.mullion);
    place(c, innerSide * (T / 2 + 0.06), ww + 0.12, 0.035, 0.14, sill - 0.017, th.trim === "#ffffff" ? "#f4f1ea" : th.trim);
  }

  function curtainWall(axis, line, p0, q0, y0, top, inner, innerSide, li) {
    const len = q0 - p0;
    const h = top - y0;
    const n = Math.max(1, Math.ceil(len / 1.5));
    const place = (along, w, hh, d, y, hex, o) => (axis === "x" ? S.box(w, hh, d, along, y, line, hex, o) : S.box(d, hh, w, line, y, along, hex, o));
    if (axis === "x") glass(len, h, 0.025, (p0 + q0) / 2, y0 + h / 2, line);
    else glass(0.025, h, len, line, y0 + h / 2, (p0 + q0) / 2);
    for (let i = 0; i <= n; i += 1) place(p0 + (len * i) / n, 0.05, h, 0.12, y0 + h / 2, th.mullion);
    place((p0 + q0) / 2, len, 0.07, 0.14, y0 + 0.035, th.mullion);
    place((p0 + q0) / 2, len, 0.1, 0.16, top - 0.05, th.mullion);
    if (h > 4) place((p0 + q0) / 2, len, 0.06, 0.12, levels[li + 1]?.y ?? y0 + h / 2, th.mullion);
    inner.windows.push({ side: sideName(axis, inner, line), c: (p0 + q0) / 2, w: len, sill: y0, head: top, glass: true });
  }

  function doorway(axis, line, g0, g1, d, y0, top, lvl, minusLook, plusLook, run, inMinus, inPlus) {
    const w = g1 - g0;
    const c = (g0 + g1) / 2;
    if (d.kind === "none") return;
    if (d.kind === "rail") {
      const keep = cutIntervals([[g0, g1]], d.skip ?? []);
      for (const [a, b] of keep) glassRail(axis, line, a, b, y0);
      return;
    }
    const head = d.kind === "open" || d.kind === "beam" ? y0 + Math.min(d.h, lvl.h) : y0 + d.h;
    if (top - head > 0.01) {
      wallHalves(axis, line, g0, g1, head, top, minusLook, plusLook);
      if (axis === "x") box(c, (head + top) / 2, line, w, top - head, T);
      else box(line, (head + top) / 2, c, T, top - head, w);
    }
    const place = (along, across, ww, hh, dd, y, hex, o) => (axis === "x" ? S.box(ww, hh, dd, along, y, line + across, hex, o) : S.box(dd, hh, ww, line + across, y, along, hex, o));
    if (d.kind === "beam") {
      const beam = th.wood;
      for (const e of [g0, g1]) place(e, 0, 0.32, head - y0, 0.42, y0 + (head - y0) / 2, beam);
      place(c, 0, w + 0.5, 0.34, 0.46, head - 0.17, beam);
      return;
    }
    if (d.kind !== "open") {
      for (const side of [-1, 1]) {
        if ((side < 0 && !inMinus) || (side > 0 && !inPlus)) continue;
        const off = side * (T / 2 + 0.012);
        place(g0 - 0.035, off, 0.07, head - y0, 0.024, y0 + (head - y0) / 2, th.trim);
        place(g1 + 0.035, off, 0.07, head - y0, 0.024, y0 + (head - y0) / 2, th.trim);
        place(c, off, w + 0.14, 0.07, 0.024, head + 0.035, th.trim);
      }
    }
    if (d.kind === "glass") {
      place(c, 0, w, 0.05, T + 0.02, head - 0.025, th.mullion);
      place(c, 0, w, 0.03, T + 0.02, y0 + 0.015, "#9aa0a8");
      const parkSide = inMinus ? 1 : -1;
      if (axis === "x") glass(w / 2, head - y0 - 0.06, 0.02, g1 - w / 4, y0 + (head - y0) / 2, line + parkSide * (T / 2 + 0.03));
      else glass(0.02, head - y0 - 0.06, w / 2, line + parkSide * (T / 2 + 0.03), y0 + (head - y0) / 2, g1 - w / 4);
      place(g1 - w / 2, parkSide * (T / 2 + 0.03), 0.04, head - y0, 0.05, y0 + (head - y0) / 2, th.mullion);
    }
    if (d.exit) {
      const leafW = w - 0.04;
      if (d.elevator) {
        place(c, 0, leafW, head - y0 - 0.02, 0.06, y0 + (head - y0) / 2, "#b9c0c7");
        place(c, 0, 0.01, head - y0 - 0.04, 0.07, y0 + (head - y0) / 2, "#7d858d");
        const inSide = inMinus ? -1 : 1;
        place(g1 + 0.25, inSide * (T / 2 + 0.02), 0.1, 0.18, 0.02, y0 + 1.15, "#2a2c31");
        place(g1 + 0.25, inSide * (T / 2 + 0.03), 0.04, 0.04, 0.02, y0 + 1.15, "#ffd27a", { glow: 1 });
      } else if (d.double) {
        for (const s of [-1, 1]) {
          place(c + (s * leafW) / 4, 0, leafW / 2 - 0.01, head - y0 - 0.02, 0.07, y0 + (head - y0) / 2, th.door);
          place(c + s * 0.06, 0, 0.03, 0.5, 0.12, y0 + 1.05, th.metal);
        }
      } else {
        place(c, 0, leafW, head - y0 - 0.02, 0.06, y0 + (head - y0) / 2, th.door);
        place(c + leafW / 2 - 0.12, 0, 0.12, 0.03, 0.14, y0 + 1.0, th.metal);
      }
      if (axis === "x") box(c, y0 + (head - y0) / 2, line, w, head - y0, T);
      else box(line, y0 + (head - y0) / 2, c, T, head - y0, w);
    }
    if (d.secret) {
      const holderNode = new TransformNode("ci-secret", scene);
      holderNode.parent = animNode;
      holderNode.position.set(axis === "x" ? c : line, y0, axis === "x" ? line : c);
      if (axis === "z") holderNode.rotation.y = Math.PI / 2;
      const sk = createKit(scene, holderNode, mats);
      const sctx = { ...ctx, k: sk, solid: () => {} };
      F.bookshelf(F.frame(sctx, 0, 0, 0, 0), { w: w + 0.1, h: Math.min(2.3, head - y0) });
      F.bookshelf(F.frame(sctx, 0, 0, Math.PI, 0), { w: w + 0.1, h: Math.min(2.3, head - y0) });
      secret = { node: holderNode, axis, c, line, y: y0, w, open: 0 };
    }
  }

  function glassRail(axis, line, a, b, y) {
    const len = b - a;
    const c = (a + b) / 2;
    if (axis === "x") {
      glass(len, 1.0, 0.02, c, y + 0.55, line);
      S.box(len, 0.05, 0.07, c, y + 1.07, line, th.metal);
      S.box(len, 0.05, 0.05, c, y + 0.03, line, th.mullion);
      box(c, y + 0.6, line, len, 1.2, 0.1);
    } else {
      glass(0.02, 1.0, len, line, y + 0.55, c);
      S.box(0.07, 0.05, len, line, y + 1.07, c, th.metal);
      S.box(0.05, 0.05, len, line, y + 0.03, c, th.mullion);
      box(line, y + 0.6, c, 0.1, 1.2, len);
    }
  }

  function fenceRun(li, axis, line, run, outdoor) {
    const y = levels[li].y;
    const cuts = doors.filter((d) => d.lv === li && d.axis === axis && near(d.line, line)).map((d) => [d.c - d.w / 2, d.c + d.w / 2]);
    for (const [a, b] of cutIntervals([[run.a, run.b]], cuts)) {
      const len = b - a;
      const c = (a + b) / 2;
      const kind = outdoor.edge ?? (outdoor.yard ? (th.edge === "glass" ? "hedge" : th.edge) : th.edge === "fence" || th.edge === "stone" ? "wood" : th.edge);
      const place = (along, w, h, d, yy, hex, o) => (axis === "x" ? S.box(w, h, d, along, yy, line, hex, o) : S.box(d, h, w, line, yy, along, hex, o));
      if (kind === "glass") glassRail(axis, line, a, b, y);
      else if (kind === "hedge") {
        place(c, len, 1.4, 0.7, y + 0.7, "#3f7a3a");
        if (!low) place(c, len + 0.05, 0.25, 0.75, y + 1.32, "#4e8f4a");
      } else if (kind === "stone") {
        place(c, len, 1.1, 0.35, y + 0.55, "#9a9286");
      } else {
        const white = kind === "wood" ? "#ffffff" : "#ffffff";
        place(c, len, 0.06, 0.08, y + 1.05, white);
        place(c, len, 0.06, 0.08, y + 0.5, white);
        const n = Math.max(2, Math.round(len / (kind === "fence" ? 0.16 : 0.14)));
        for (let i = 0; i <= n; i += low ? 2 : 1) place(a + (len * i) / n, 0.045, 1.0, 0.045, y + 0.55, white);
      }
      const hgt = outdoor.yard ? 2.6 : 3.2;
      if (axis === "x") box(c, y + hgt / 2, line, len, hgt, 0.2);
      else box(line, y + hgt / 2, c, 0.2, hgt, len);
    }
  }

  /* -------- floors, ceilings, curves */
  function emitFloors() {
    const lv0 = rooms.filter((r) => r.lv === 0);
    const bx = [Math.min(...lv0.map((r) => r.x0)), Math.min(...lv0.map((r) => r.z0)), Math.max(...lv0.map((r) => r.x1)), Math.max(...lv0.map((r) => r.z1))];
    const poolHoles = (lv) => pools.filter((p) => p.lv === lv).map((p) => p.r);
    for (const rect of subtractAll([bx], [...poolHoles(0), ...holes.filter((h) => h.lv === 0).map((h) => h.r), ...floorCut(0)])) solidRect(rect, -0.6, 0);
    for (const r of rooms) {
      const lvHoles = [...holes.filter((h) => h.lv === r.lv).map((h) => h.r), ...poolHoles(r.lv), ...floorCut(r.y)];
      const rects = subtractAll([[r.x0, r.z0, r.x1, r.z1]], lvHoles);
      const [kind, hex, alt] = floorOf(th, r);
      for (const rect of rects) {
        const w = rect[2] - rect[0];
        const d = rect[3] - rect[1];
        sbox(w, 0.05, d, (rect[0] + rect[2]) / 2, r.y - 0.025, (rect[1] + rect[3]) / 2, { kind, hex, alt });
        if (r.lv > 0) {
          solidRect(rect, r.y - 0.3, r.y);
          if (r.out) S.box(w, 0.2, d, (rect[0] + rect[2]) / 2, r.y - 0.15, (rect[1] + rect[3]) / 2, th.ceiling);
        }
      }
      if (r.out) continue;
      const next = levels[r.lv + 1];
      const ceilY = r.y + r.h;
      const above = r.tall ? [] : holes.filter((h) => h.lv === r.lv + 1).map((h) => h.r);
      let ceilRects = subtractAll([[r.x0, r.z0, r.x1, r.z1]], [...above, ...ceilCut(ceilY)]);
      if (r.skylight) ceilRects = subtractAll(ceilRects, [r.skylight]);
      const thick = next && !r.tall ? Math.max(0.05, next.y - 0.05 - ceilY) : 0.25;
      for (const rect of ceilRects) {
        sbox(rect[2] - rect[0], thick, rect[3] - rect[1], (rect[0] + rect[2]) / 2, ceilY + thick / 2, (rect[1] + rect[3]) / 2, th.ceiling);
        solidRect(rect, ceilY, ceilY + 0.2);
      }
      if (r.skylight) {
        const [x0, z0, x1, z1] = r.skylight;
        solidRect(r.skylight, ceilY + 0.6, ceilY + 0.8);
        S.box(x1 - x0, 0.03, z1 - z0, (x0 + x1) / 2, ceilY + 0.7, (z0 + z1) / 2, null, { material: mats.get("#dff3ff", 0.25, 0.3) });
        for (const [w, d, x, z] of [[x1 - x0, 0.1, (x0 + x1) / 2, z0], [x1 - x0, 0.1, (x0 + x1) / 2, z1], [0.1, z1 - z0, x0, (z0 + z1) / 2], [0.1, z1 - z0, x1, (z0 + z1) / 2]]) {
          S.box(w, 0.75, d, x, ceilY + 0.37, z, th.ceiling);
        }
        if (!low) for (const [w, d, x, z] of [[x1 - x0, 0.04, (x0 + x1) / 2, z0 + 0.06], [x1 - x0, 0.04, (x0 + x1) / 2, z1 - 0.06], [0.04, z1 - z0, x0 + 0.06, (z0 + z1) / 2], [0.04, z1 - z0, x1 - 0.06, (z0 + z1) / 2]]) {
          S.box(w, 0.03, d, x, ceilY + 0.04, z, "#fff1d0", { glow: 1 });
        }
      }
    }
  }

  function emitCurves() {
    for (const r of rooms) {
      if (!r.curve) continue;
      const side = r.curve.side;
      const sag = r.curve.sag;
      const alongX = side[0] === "z";
      const [a, b] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
      const line = side === "x0" ? r.x0 : side === "x1" ? r.x1 : side === "z0" ? r.z0 : r.z1;
      const out = side.endsWith("0") ? -1 : 1;
      const chord = b - a;
      const R = (chord * chord) / 4 / (2 * sag) + sag / 2;
      const mid = (a + b) / 2;
      const centerOff = line + out * (sag - R);
      const pt = (u) => {
        const along = mid + u;
        const reach = Math.sqrt(Math.max(0, R * R - u * u));
        const across = centerOff + out * reach;
        return alongX ? [along, across] : [across, along];
      };
      const sagAt = (u) => Math.sqrt(Math.max(0, R * R - u * u)) - (R - sag);
      const n = low ? 10 : 16;
      const y0 = r.y;
      const y1 = r.y + r.h;
      const [kind, hex, alt] = floorOf(th, r);
      const strips = low ? 8 : 14;
      for (let i = 0; i < strips; i += 1) {
        const u0 = -chord / 2 + (chord * i) / strips;
        const u1 = u0 + chord / strips;
        const s = Math.max(sagAt(u0), sagAt(u1)) + 0.05;
        const along = mid + (u0 + u1) / 2;
        const across = line + (out * s) / 2;
        const [x, z] = alongX ? [along, across] : [across, along];
        const [w, d] = alongX ? [u1 - u0 + 0.01, s] : [s, u1 - u0 + 0.01];
        sbox(w, 0.05, d, x, y0 - 0.025, z, { kind, hex, alt });
        sbox(w, 0.25, d, x, y1 + 0.125, z, th.ceiling);
      }
      const [bx, bz] = alongX ? [mid, line + (out * sag) / 2] : [line + (out * sag) / 2, mid];
      const [bw, bd] = alongX ? [chord, sag] : [sag, chord];
      box(bx, y0 - 0.3, bz, bw, 0.6, bd);
      box(bx, y1 + 0.1, bz, bw, 0.2, bd);
      for (let i = 0; i < n; i += 1) {
        const u0 = -chord / 2 + (chord * i) / n;
        const u1 = u0 + chord / n;
        const [x0, z0] = pt(u0);
        const [x1, z1] = pt(u1);
        const len = Math.hypot(x1 - x0, z1 - z0);
        const yaw = Math.atan2(x1 - x0, z1 - z0);
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        glass(0.025, r.h, len + 0.01, cx, y0 + r.h / 2, cz, { ry: yaw });
        S.box(0.06, r.h, 0.06, x0, y0 + r.h / 2, z0, th.mullion);
        S.box(0.1, 0.08, len + 0.04, cx, y0 + 0.04, cz, th.mullion, { ry: yaw });
        S.box(0.1, 0.1, len + 0.04, cx, y1 - 0.05, cz, th.mullion, { ry: yaw });
        box(cx, y0 + r.h / 2, cz, 0.2, r.h + 0.4, len + 0.08, Quaternion.RotationYawPitchRoll(yaw, 0, 0));
        const [ix, iz] = alongX ? [cx, cz - out * 0.32] : [cx - out * 0.32, cz];
        K.box(len + 0.02, 0.42, 0.5, ix, y0 + 0.21, iz, th.wood, { ry: yaw });
        K.box(len + 0.02, 0.06, 0.52, ix, y0 + 0.45, iz, th.fabric, { ry: yaw });
      }
      const [lx, lz] = pt(chord / 2);
      S.box(0.06, r.h, 0.06, lx, y0 + r.h / 2, lz, th.mullion);
      r.windows.push({ side, c: mid, w: chord, sill: y0, head: y1, glass: true, curved: true });
      r.glassFaces.add(side);
    }
  }

  /* -------- stairs, rails, pools */
  function emitStairs() {
    for (const s of L.stairs ?? []) {
      const y0 = levels[s.lv].y;
      const rise = levels[s.lv + 1].y - y0;
      let total;
      let point;
      if (s.arc) {
        const { cx, cz, r, a0, a1 } = s.arc;
        total = Math.abs(a1 - a0) * r;
        point = (u) => {
          const ang = a0 + (a1 - a0) * (u / total);
          return [cx + r * Math.sin(ang), cz + r * Math.cos(ang)];
        };
      } else {
        const [fx, fz] = s.from;
        const [tx, tz] = s.to;
        total = Math.hypot(tx - fx, tz - fz);
        point = (u) => [fx + ((tx - fx) * u) / total, fz + ((tz - fz) * u) / total];
      }
      const n = Math.ceil(rise / 0.18);
      const riser = rise / n;
      const run = total / n;
      const tangent = (u) => {
        const [x0, z0] = point(Math.max(0, u - 0.05));
        const [x1, z1] = point(Math.min(total, u + 0.05));
        return Math.atan2(x1 - x0, z1 - z0);
      };
      const stepHex = th.fam === "castle" ? "#8d7f6c" : th.fam === "night" || th.fam === "walnut" ? th.wood : th.floors.default[1];
      const stepKind = th.floors.default[0];
      const rails = s.rails ?? "both";
      const rect = [Infinity, Infinity, -Infinity, -Infinity];
      for (let k = 0; k < n; k += 1) {
        const u = (k + 0.5) * run;
        const [x, z] = point(u);
        const yaw = tangent(u);
        const topY = y0 + (k + 1) * riser;
        if (s.kind === "solid") {
          const h = topY - y0;
          sbox(s.w, h, run + 0.02, x, y0 + h / 2, z, { kind: stepKind, hex: stepHex, alt: "#000" }, { ry: yaw });
          if (th.fam === "castle") S.box(s.w * 0.55, 0.012, run + 0.03, x, topY + 0.006, z, "#8a1f2e", { ry: yaw });
        } else {
          sbox(s.w, 0.06, run + 0.05, x, topY - 0.03, z, { kind: stepKind, hex: stepHex, alt: "#000" }, { ry: yaw });
          if (!low || k % 2 === 0) {
            const fx = x - Math.sin(yaw) * (run / 2);
            const fz = z - Math.cos(yaw) * (run / 2);
            S.box(s.w * 0.94, 0.015, 0.03, fx, topY - 0.07, fz, "#ffcf8a", { glow: 1, ry: yaw });
          }
        }
        for (const side of rails === "both" ? [-1, 1] : rails === "left" ? [-1] : rails === "right" ? [1] : []) {
          const rx = x + Math.cos(yaw) * side * (s.w / 2 + 0.02);
          const rz = z - Math.sin(yaw) * side * (s.w / 2 + 0.02);
          glass(0.02, 0.9, run + 0.02, rx, topY + 0.45, rz, { ry: yaw });
          S.box(0.05, 0.04, run + 0.04, rx, topY + 0.92, rz, th.metal, { ry: yaw });
        }
        for (const [px, pz] of [[x - s.w, z - s.w], [x + s.w, z + s.w]]) {
          rect[0] = Math.min(rect[0], px);
          rect[1] = Math.min(rect[1], pz);
          rect[2] = Math.max(rect[2], px);
          rect[3] = Math.max(rect[3], pz);
        }
      }
      if (s.kind !== "solid" && !s.arc) {
        const [x0, z0] = point(0);
        const [x1, z1] = point(total);
        const yaw = Math.atan2(x1 - x0, z1 - z0);
        const len = Math.hypot(total, rise);
        S.box(0.12, 0.25, len, (x0 + x1) / 2, y0 + rise / 2 - 0.2, (z0 + z1) / 2, th.mullion, { ry: yaw, rx: -Math.atan2(rise, total) });
      }
      const segs = s.arc ? Math.ceil(n / 3) : 1;
      const lift = riser * 0.3;
      for (let j = 0; j < segs; j += 1) {
        let u0 = (total * j) / segs;
        const u1 = (total * (j + 1)) / segs;
        if (j === 0) u0 = -0.5;
        const [x0, z0] = point(Math.max(0, u0));
        const [x1, z1] = point(u1);
        const dirYaw = Math.atan2(x1 - x0, z1 - z0);
        const ex0 = u0 < 0 ? x0 - Math.sin(dirYaw) * 0.5 : x0;
        const ez0 = u0 < 0 ? z0 - Math.cos(dirYaw) * 0.5 : z0;
        const h0 = y0 + (rise * u0) / total + lift;
        const h1 = y0 + (rise * u1) / total + lift;
        const dist = Math.hypot(x1 - ex0, z1 - ez0);
        const dy = h1 - h0;
        const pitch = -Math.atan2(dy, dist);
        const len = Math.hypot(dist, dy) + (s.arc ? 0.2 : 0);
        const cy = (h0 + h1) / 2 - 0.06 / Math.cos(pitch);
        box((ex0 + x1) / 2, cy, (ez0 + z1) / 2, s.w, 0.12, len, Quaternion.RotationYawPitchRoll(dirYaw, pitch, 0));
        const under = Math.min(h0, h1) - y0 - 0.05;
        if (s.kind === "solid" || under < 1.7) {
          const parts = s.arc ? 1 : 4;
          for (let p = 0; p < parts; p += 1) {
            const pu0 = Math.max(0, u0) + ((u1 - Math.max(0, u0)) * p) / parts;
            const pu1 = Math.max(0, u0) + ((u1 - Math.max(0, u0)) * (p + 1)) / parts;
            const hh = (rise * pu0) / total - 0.05;
            if (hh < 0.3) continue;
            if (s.kind !== "solid" && hh > 1.7) continue;
            const [ax, az] = point(pu0);
            const [bx2, bz2] = point(pu1);
            box((ax + bx2) / 2, y0 + hh / 2, (az + bz2) / 2, s.w * 0.98, hh, Math.hypot(bx2 - ax, bz2 - az), Quaternion.RotationYawPitchRoll(dirYaw, 0, 0));
          }
        }
      }
      const [sx, sz] = point(0);
      const sy = tangent(0);
      const startZone = [sx - Math.sin(sy) * 1.3 - 0.8, sz - Math.cos(sy) * 1.3 - 0.8, sx - Math.sin(sy) * 1.3 + 0.8, sz - Math.cos(sy) * 1.3 + 0.8];
      for (const r of rooms) {
        if (r.lv !== s.lv) continue;
        const rr = [Math.max(rect[0], r.x0), Math.max(rect[1], r.z0), Math.min(rect[2], r.x1), Math.min(rect[3], r.z1)];
        if (rr[2] > rr[0] && rr[3] > rr[1]) r.occ.push(rr);
        if (overlaps(startZone, [r.x0, r.z0, r.x1, r.z1])) r.occ.push(startZone);
      }
      const [ex, ez] = point(total);
      const ey = tangent(total);
      const endZone = [ex + Math.sin(ey) * 1.0 - 0.9, ez + Math.cos(ey) * 1.0 - 0.9, ex + Math.sin(ey) * 1.0 + 0.9, ez + Math.cos(ey) * 1.0 + 0.9];
      for (const r of rooms) if (r.lv === s.lv + 1 && overlaps(endZone, [r.x0, r.z0, r.x1, r.z1])) r.occ.push(endZone);
    }
  }

  function emitRails() {
    for (const rl of L.rails ?? []) {
      const y = levels[rl.lv].y;
      const [ax, az] = rl.a;
      const [bx2, bz2] = rl.b;
      if (near(az, bz2)) glassRail("x", az, Math.min(ax, bx2), Math.max(ax, bx2), y);
      else glassRail("z", ax, Math.min(az, bz2), Math.max(az, bz2), y);
    }
  }

  function emitPools() {
    for (const p of pools) {
      const y = levels[p.lv].y;
      const surface = y - 0.12;
      const floorY = surface - p.depth;
      const [x0, z0, x1, z1] = p.r;
      const w = x1 - x0;
      const d = z1 - z0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const tile = { kind: "tile", hex: "#5fc3e4", alt: "#e8f7ff", size: 0.5 };
      const wallT = 0.3;
      solidRect([x0 - wallT, z0 - wallT, x1 + wallT, z0], floorY - 0.3, y);
      solidRect([x0 - wallT, z1, x1 + wallT, z1 + wallT], floorY - 0.3, y);
      solidRect([x0 - wallT, z0, x0, z1], floorY - 0.3, y);
      solidRect([x1, z0, x1 + wallT, z1], floorY - 0.3, y);
      solidRect([x0, z0, x1, z1], floorY - 0.3, floorY);
      sbox(w, 0.04, d, cx, floorY - 0.02, cz, tile);
      sbox(w, y - floorY, 0.04, cx, (y + floorY) / 2, z0 + 0.02, tile);
      sbox(w, y - floorY, 0.04, cx, (y + floorY) / 2, z1 - 0.02, tile);
      sbox(0.04, y - floorY, d, x0 + 0.02, (y + floorY) / 2, cz, tile);
      sbox(0.04, y - floorY, d, x1 - 0.02, (y + floorY) / 2, cz, tile);
      const steps = Math.ceil((y - floorY) / 0.24);
      const riser = (y - floorY) / steps;
      for (let i = 0; i < steps - 1; i += 1) {
        const topY = y - (i + 1) * riser;
        const depth = 0.4;
        let r;
        if (p.steps === "x0") r = [x0, z0 + d * 0.3, x0 + depth * (i + 1), z1 - d * 0.3];
        else if (p.steps === "x1") r = [x1 - depth * (i + 1), z0 + d * 0.3, x1, z1 - d * 0.3];
        else if (p.steps === "z0") r = [x0 + w * 0.25, z0, x1 - w * 0.25, z0 + depth * (i + 1)];
        else r = [x0 + w * 0.25, z1 - depth * (i + 1), x1 - w * 0.25, z1];
        solidRect(r, floorY - 0.3, topY);
        sbox(r[2] - r[0], topY - floorY, r[3] - r[1], (r[0] + r[2]) / 2, (topY + floorY) / 2, (r[1] + r[3]) / 2, "#e8f7ff");
      }
      const coping = th.fam === "stone" || th.fam === "marble" ? "#e9e6e1" : "#f4f1ea";
      for (const [cw, cd, x, z] of [[w + 0.8, 0.4, cx, z0 - 0.2], [w + 0.8, 0.4, cx, z1 + 0.2], [0.4, d, x0 - 0.2, cz], [0.4, d, x1 + 0.2, cz]]) S.box(cw, 0.04, cd, x, y + 0.01, z, coping);
      if (!low) for (const [lw, ld, x, z] of [[w - 0.2, 0.03, cx, z0 + 0.05], [w - 0.2, 0.03, cx, z1 - 0.05], [0.03, d - 0.2, x0 + 0.05, cz], [0.03, d - 0.2, x1 - 0.05, cz]]) S.box(lw, 0.05, ld, x, surface - 0.18, z, "#bff6ff", { glow: 1 });
      const water = MeshBuilder.CreateGround("ci-water", { width: w, height: d }, scene);
      water.parent = animNode;
      water.position.set(cx, surface, cz);
      water.material = waterMaterial(scene, th.fam === "stone" ? "#0f2a36" : "#2fb4dc", low);
      water.isPickable = false;
      extra.push(water);
      waters.push({ shape: "box", x: base.x + cx, z: base.z + cz, w, d, surfaceY: base.y + surface, floorY: base.y + floorY, kind: "pool" });
      for (const r of rooms) {
        if (r.lv !== p.lv) continue;
        const rr = [Math.max(x0 - 0.6, r.x0), Math.max(z0 - 0.6, r.z0), Math.min(x1 + 0.6, r.x1), Math.min(z1 + 0.6, r.z1)];
        if (rr[2] > rr[0] && rr[3] > rr[1]) r.occ.push(rr);
      }
    }
  }

  /** A water slide: a half-pipe chute from `top` down to `bottom`, ending over the pool. */
  function emitSlide() {
    const s = L.slide;
    if (!s) return;
    const [x0, z0] = s.from;
    const [x1, z1] = s.to;
    const run = Math.hypot(x1 - x0, z1 - z0);
    const drop = s.top - s.bottom;
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const pitch = Math.atan2(drop, run);
    const len = Math.hypot(run, drop);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const cy = (s.top + s.bottom) / 2;
    const rot = Quaternion.RotationYawPitchRoll(yaw, pitch, 0);
    box(cx, cy - 0.08, cz, s.w, 0.12, len, rot);
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * side * (s.w / 2 + 0.06);
      const oz = -Math.sin(yaw) * side * (s.w / 2 + 0.06);
      box(cx + ox, cy + 0.35, cz + oz, 0.1, 0.8, len, rot);
    }
    const chute = MeshBuilder.CreateCylinder("ci-slide", { diameter: s.w + 0.2, height: len, tessellation: 20, arc: 0.5, enclose: false, sideOrientation: 2 }, scene);
    chute.parent = shellNode;
    chute.position.set(cx, cy + 0.32, cz);
    chute.rotation.set(Math.PI / 2 + pitch, yaw, Math.PI);
    chute.material = mats.get("#ffffff");
    const stripe = MeshBuilder.CreateCylinder("ci-slide-in", { diameter: s.w + 0.16, height: len, tessellation: 20, arc: 0.5, enclose: false, sideOrientation: 2 }, scene);
    stripe.parent = shellNode;
    stripe.position.set(cx, cy + 0.33, cz);
    stripe.rotation.set(Math.PI / 2 + pitch, yaw, Math.PI);
    stripe.material = mats.get("#7fdcf0", 0.15);
    const posts = Math.max(2, Math.round(run / 1.6));
    for (let i = 1; i < posts; i += 1) {
      const u = i / posts;
      const px = x0 + (x1 - x0) * u;
      const pz = z0 + (z1 - z0) * u;
      const top = s.top - drop * u - 0.2;
      const base = -0.12 - 1.8;
      if (top - base > 0.3) S.cyl(0.14, 0.14, top - base, px, (top + base) / 2, pz, "#e9e6e1", { tess: 8 });
    }
    const lane = [Math.min(x0, x1) - 0.9, Math.min(z0, z1) - 1.3, Math.max(x0, x1) + 0.9, Math.max(z0, z1)];
    for (const r of rooms) if (overlaps(lane, [r.x0, r.z0, r.x1, r.z1])) r.occ.push(lane);
  }

  /* -------- furniture placement */
  function sidesOf(r) {
    const mk = (name, axis, line, a, b, nx, nz) => {
      const gaps = doors
        .filter((d) => (d.lv === r.lv || (r.tall && d.lv === r.lv + 1 && d.kind !== "rail")) && d.axis === axis && near(d.line, line) && d.c > a - 0.01 && d.c < b + 0.01 && d.kind !== "none")
        .map((d) => [d.c - d.w / 2, d.c + d.w / 2, d]);
      const wins = r.windows.filter((w) => w.side === name);
      return { name, axis, line, a, b, nx, nz, gaps, glass: r.glassFaces.has(name), windows: wins.map((w) => [w.c - w.w / 2, w.c + w.w / 2]), curved: wins.some((w) => w.curved) };
    };
    return [mk("z0", "x", r.z0, r.x0, r.x1, 0, 1), mk("z1", "x", r.z1, r.x0, r.x1, 0, -1), mk("x0", "z", r.x0, r.z0, r.z1, 1, 0), mk("x1", "z", r.x1, r.z0, r.z1, -1, 0)];
  }

  function prepRoom(r) {
    r.sides = sidesOf(r);
    for (const s of r.sides) {
      for (const [g0, g1, d] of s.gaps) {
        const depth = d.kind === "rail" ? 0.3 : d.w > 2 ? 0.9 : 1.15;
        const a0 = g0 - 0.15;
        const a1 = g1 + 0.15;
        if (s.name === "z0") r.occ.push([a0, s.line, a1, s.line + depth]);
        if (s.name === "z1") r.occ.push([a0, s.line - depth, a1, s.line]);
        if (s.name === "x0") r.occ.push([s.line, a0, s.line + depth, a1]);
        if (s.name === "x1") r.occ.push([s.line - depth, a0, s.line, a1]);
      }
      if (s.curved) {
        const reach = 0.9;
        if (s.name === "x0") r.occ.push([s.line - 3, s.a, s.line + reach, s.b]);
        if (s.name === "x1") r.occ.push([s.line - reach, s.a, s.line + 3, s.b]);
        if (s.name === "z0") r.occ.push([s.a, s.line - 3, s.b, s.line + reach]);
        if (s.name === "z1") r.occ.push([s.a, s.line - reach, s.b, s.line + 3]);
      }
    }
  }

  function footprint(s, c, w, d) {
    const f = T / 2 + 0.02;
    if (s.name === "z0") return [c - w / 2, s.line + f, c + w / 2, s.line + f + d];
    if (s.name === "z1") return [c - w / 2, s.line - f - d, c + w / 2, s.line - f];
    if (s.name === "x0") return [s.line + f, c - w / 2, s.line + f + d, c + w / 2];
    return [s.line - f - d, c - w / 2, s.line - f, c + w / 2];
  }

  const RY = { z1: 0, z0: Math.PI, x1: Math.PI / 2, x0: -Math.PI / 2 };

  function fits(r, rect) {
    const inset = T / 2;
    if (rect[0] < r.x0 + inset - EPS || rect[2] > r.x1 - inset + EPS || rect[1] < r.z0 + inset - EPS || rect[3] > r.z1 - inset + EPS) return false;
    return !r.occ.some((o) => overlaps(o, rect));
  }

  /** Finds a spot against a wall for a piece w wide and d deep and reserves it. */
  function wallSpot(r, w, d, { prefer, glassOk = true, windowsOk = true, tall = false, sides } = {}) {
    let order = (sides ?? r.sides).slice();
    if (prefer) order.sort((p, q) => prefer(q) - prefer(p));
    else order.sort((p, q) => q.b - q.a - (p.b - p.a));
    for (const s of order) {
      if (!glassOk && s.glass) continue;
      if (s.curved) continue;
      let free = cutIntervals([[s.a + 0.05, s.b - 0.05]], s.gaps.map(([g0, g1]) => [g0 - 0.2, g1 + 0.2]));
      if (!windowsOk) free = cutIntervals(free, s.windows.map(([a, b]) => [a - 0.05, b + 0.05]));
      if (tall) free = cutIntervals(free, r.tallSpans.filter((t) => t.side === s.name).map((t) => [t.a, t.b]));
      free.sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
      for (const [fa, fb] of free) {
        if (fb - fa < w) continue;
        for (const c of [(fa + fb) / 2, fa + w / 2 + 0.02, fb - w / 2 - 0.02]) {
          const rect = footprint(s, c, w, d);
          if (!fits(r, rect)) continue;
          r.occ.push(rect);
          if (tall) r.tallSpans.push({ side: s.name, a: c - w / 2, b: c + w / 2 });
          const x = (rect[0] + rect[2]) / 2;
          const z = (rect[1] + rect[3]) / 2;
          return { x, z, ry: RY[s.name], side: s, c, rect };
        }
      }
    }
    return null;
  }

  /** A spot on a wall at eye height (art, mirrors, TVs) that doesn't need floor space. */
  function wallFace(r, w, { glassOk = false, avoid = [] } = {}) {
    const order = r.sides.slice().sort((p, q) => q.b - q.a - (p.b - p.a));
    for (const s of order) {
      if (s.glass || s.curved) continue;
      let free = cutIntervals([[s.a + 0.3, s.b - 0.3]], s.gaps.map(([g0, g1]) => [g0 - 0.25, g1 + 0.25]));
      free = cutIntervals(free, s.windows.map(([a, b]) => [a - 0.1, b + 0.1]));
      free = cutIntervals(free, r.tallSpans.filter((t) => t.side === s.name).map((t) => [t.a - 0.1, t.b + 0.1]));
      free = cutIntervals(free, avoid.filter((t) => t.side === s.name).map((t) => [t.a, t.b]));
      free.sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
      const best = free.find(([a, b]) => b - a >= w);
      if (!best) continue;
      const c = (best[0] + best[1]) / 2;
      const rect = footprint(s, c, w, 0.04);
      r.tallSpans.push({ side: s.name, a: c - w / 2, b: c + w / 2 });
      void glassOk;
      return { x: (rect[0] + rect[2]) / 2, z: (rect[1] + rect[3]) / 2, ry: RY[s.name], side: s, c };
    }
    return null;
  }

  function centerSpot(r, w, d, { margin = 0.8, ry = 0 } = {}) {
    const swap = Math.abs(Math.sin(ry)) > 0.5;
    const fw = swap ? d : w;
    const fd = swap ? w : d;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const tries = [[0, 0]];
    for (let s = 0.5; s < 6; s += 0.5) for (const [dx, dz] of [[s, 0], [-s, 0], [0, s], [0, -s], [s, s], [-s, -s], [s, -s], [-s, s]]) tries.push([dx, dz]);
    for (const [dx, dz] of tries) {
      const x = cx + dx;
      const z = cz + dz;
      const rect = [x - fw / 2 - margin, z - fd / 2 - margin, x + fw / 2 + margin, z + fd / 2 + margin];
      if (!fits(r, rect)) continue;
      r.occ.push([x - fw / 2 - margin * 0.5, z - fd / 2 - margin * 0.5, x + fw / 2 + margin * 0.5, z + fd / 2 + margin * 0.5]);
      return { x, z, ry };
    }
    return null;
  }

  function cornerSpots(r, size = 0.6) {
    const out = [];
    const i = T / 2 + 0.05;
    for (const [x, z] of [[r.x0 + i, r.z0 + i], [r.x1 - i - size, r.z0 + i], [r.x0 + i, r.z1 - i - size], [r.x1 - i - size, r.z1 - i - size]]) {
      const rect = [x, z, x + size, z + size];
      if (fits(r, rect)) {
        r.occ.push(rect);
        out.push([x + size / 2, z + size / 2]);
      }
    }
    return out;
  }

  const P = (x, z, ry, r) => F.frame(ctx, x, z, ry, r.y);

  /* -------- room furnishers */
  function lounge(r, { sofaW = 2.4, depth = 3.0, tvFirst = true } = {}) {
    let anchor = null;
    if (th.fireplace && !r.out) {
      anchor = wallSpot(r, 2.6, 0.55, { glassOk: false, windowsOk: false, tall: true });
      if (anchor) {
        flames.push(...F.fireplace(P(anchor.x, anchor.z, anchor.ry, r), { kind: th.fireplace, w: 1.6, ceil: r.h }));
        if (th.fireplace === "modern" && r.h < 4.5) {
          const pf = P(anchor.x, anchor.z, anchor.ry, r);
          pf.box(1.3, 0.75, 0.04, 0, 1.75, -0.2, "#111216");
          pf.box(1.24, 0.69, 0.01, 0, 1.75, -0.225, th.screen, { glow: 0.45 });
        }
      }
    }
    if (!anchor && tvFirst) {
      anchor = wallSpot(r, 2.0, 0.5, { glassOk: false, windowsOk: false, tall: true });
      if (anchor) F.mediaWall(P(anchor.x, anchor.z, anchor.ry, r), { w: 2.0 });
    }
    if (!anchor) return null;
    const s = anchor.side;
    const nx = s.nx;
    const nz = s.nz;
    const roomDepth = s.axis === "x" ? r.z1 - r.z0 : r.x1 - r.x0;
    const dist = Math.max(2.0, Math.min(depth, roomDepth - 1.6));
    const sofaRy = anchor.ry + Math.PI;
    for (let tryDist = dist; tryDist >= 1.9; tryDist -= 0.3) {
      const sx = anchor.x + nx * tryDist;
      const sz = anchor.z + nz * tryDist;
      const sw = th.sectional && r.w2 > 30 ? sofaW + 0.6 : sofaW;
      const half = [Math.abs(nz) > 0.5 ? sw / 2 : 0.5, Math.abs(nx) > 0.5 ? sw / 2 : 0.5];
      const rect = [sx - half[0], sz - half[1], sx + half[0], sz + half[1]];
      if (!fits(r, rect)) continue;
      r.occ.push(rect);
      const ps = P(sx, sz, sofaRy, r);
      if (th.modular) {
        for (let i = 0; i < 3; i += 1) {
          const m = ps.sub((i - 1) * 0.95, 0);
          m.box(0.92, 0.38, 0.95, 0, 0.19, 0, th.fabric);
          m.box(0.88, 0.1, 0.9, 0, 0.43, 0, F.shade(th.fabric, 0.03));
          m.box(0.92, 0.32, 0.22, 0, 0.62, 0.36, th.fabric);
        }
        ps.solid(2.85, 0.5, 0.95, 0, 0.25, 0);
      } else if (th.curvedSofa) {
        for (let i = 0; i < 5; i += 1) {
          const ang = (i - 2) * 0.32;
          const m = ps.sub(Math.sin(ang) * 1.9, (1 - Math.cos(ang)) * 1.9, -ang);
          m.box(0.85, 0.4, 0.95, 0, 0.2, 0, th.fabric);
          m.box(0.8, 0.14, 0.82, 0, 0.47, -0.04, "#ffffff");
          m.box(0.85, 0.42, 0.24, 0, 0.66, 0.36, th.fabric, { rx: -0.08 });
          if (!low && i % 2 === 0) m.box(0.4, 0.38, 0.12, 0, 0.68, 0.18, i === 2 ? th.accent2 : "#ffffff", { rx: -0.2 });
        }
        ps.solid(3.2, 0.55, 1.2, 0, 0.27, 0.3);
      } else if (th.sectional && sw > 2.8) {
        F.sectional(ps, { w: sw, ret: 2.0, wood: th.sofaWood });
      } else {
        F.sofa(ps, { w: sw, wood: th.sofaWood });
      }
      const tx = anchor.x + nx * (tryDist * 0.5);
      const tz = anchor.z + nz * (tryDist * 0.5);
      F.rug(P(anchor.x + nx * (tryDist * 0.55), anchor.z + nz * (tryDist * 0.55), anchor.ry, r), { w: sw + 1.0, d: tryDist + 0.4, round: th.curvedSofa });
      F.coffeeTable(P(tx, tz, anchor.ry, r), { w: th.curvedSofa || th.fam === "night" ? 1.0 : 1.2, round: th.curvedSofa || th.fam === "night" || th.fam === "villa" ? th.fam !== "villa" : false, top: th.fam === "walnut" ? "#3a2416" : th.wood });
      if (th.fam === "night" && !low) for (const dx of [-0.9, 0.9]) F.candles(P(tx + dx * Math.abs(nz), tz + dx * Math.abs(nx), 0, r), 0, 0, 0);
      for (const side of [-1, 1]) {
        const ax = tx + side * Math.abs(nz) * (sw / 2 + 0.55);
        const az = tz + side * Math.abs(nx) * (sw / 2 + 0.55);
        const arect = [ax - 0.5, az - 0.5, ax + 0.5, az + 0.5];
        if (!fits(r, arect)) continue;
        r.occ.push(arect);
        const yaw = Math.atan2(tx - ax, tz - az) + Math.PI;
        if (th.curvedSofa || th.modular) {
          const pa = P(ax, az, yaw, r);
          pa.cyl(0.85, 0.8, 0.42, 0, 0.21, 0, "#ffffff", { tess: 18 });
          pa.cyl(0.9, 0.9, 0.36, 0, 0.6, 0.06, "#ffffff", { tess: 18, arc: 0.6 });
          pa.cyl(0.66, 0.66, 0.1, 0, 0.46, -0.02, "#fbfaf6", { tess: 18 });
          pa.solid(0.8, 0.5, 0.8, 0, 0.25, 0);
        } else F.armchair(P(ax, az, yaw, r), { wood: th.sofaWood });
      }
      const lampSpot = wallSpot(r, 0.5, 0.5, {});
      if (lampSpot) F.floorLamp(P(lampSpot.x, lampSpot.z, lampSpot.ry, r), 0, 0, { arc: th.cove });
      if (th.curvedSofa && !low) {
        const dx = tx + Math.abs(nz) * (sw / 2 + 0.2);
        const dz = tz + Math.abs(nx) * (sw / 2 + 0.2);
        const pd = P(dx, dz - 0.0, 0, r);
        pd.cyl(0.45, 0.45, 0.5, 0, 0.25, 0, th.wood, { tess: 16 });
      }
      return { anchor, sofa: [sx, sz] };
    }
    return { anchor };
  }

  function plants(r, n = 2) {
    const spots = cornerSpots(r, 0.6);
    for (let i = 0; i < Math.min(n, spots.length); i += 1) {
      const [x, z] = spots[i];
      F.plantPot(P(x, z, 0, r), 0, 0, th.plants[i % th.plants.length]);
    }
  }

  function art(r, w = 1.1, h = 0.75) {
    const s = wallFace(r, w + 0.3);
    if (!s) return;
    const y = Math.min(1.6, r.h - h / 2 - 0.4);
    F.wallArt(P(s.x, s.z, s.ry, r), { w, h, y, motif: th.art === "soft" ? "abstract" : th.art });
  }

  function curtains(r) {
    if (low && !["living", "bedroom"].includes(r.kind)) return;
    for (const win of r.windows) {
      if (win.curved) continue;
      const side = r.sides.find((s) => s.name === win.side);
      if (!side) continue;
      const inward = 0.22;
      const top = Math.min(win.head + 0.15, r.y + r.h - 0.05);
      const h = top - (win.glass ? r.y + 0.02 : win.sill - 0.15);
      for (const e of [-1, 1]) {
        const along = win.c + e * (win.w / 2 + (win.glass ? -0.25 : 0.12));
        const [x, z] = side.axis === "x" ? [along, side.line + side.nz * inward] : [side.line + side.nx * inward, along];
        const [w, d] = side.axis === "x" ? [0.42, 0.06] : [0.06, 0.42];
        K.box(w, h, d, x, top - h / 2, z, th.fam === "spooky" ? "#2a1f33" : "#fbfaf5", { alpha: win.glass ? 0.8 : 0.9 });
      }
      if (!win.glass || win.w < 6) {
        const [x, z] = side.axis === "x" ? [win.c, side.line + side.nz * inward] : [side.line + side.nx * inward, win.c];
        const [w, d] = side.axis === "x" ? [win.w + 0.8, 0.03] : [0.03, win.w + 0.8];
        K.box(w, 0.03, d, x, top + 0.02, z, th.metalDark);
      }
    }
  }

  function ceilingLights(r) {
    if (r.out) return;
    const ceil = r.y + r.h - 0.005;
    const step = low ? 2.6 : 1.7;
    const inset = 0.7;
    for (let x = r.x0 + inset; x <= r.x1 - inset + 0.01; x += step) {
      for (let z = r.z0 + inset; z <= r.z1 - inset + 0.01; z += step) {
        if (holes.some((h) => h.lv === r.lv + 1 && !r.tall && x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1)) continue;
        if (inShaft(x, z, 0.25)) continue;
        if (r.skylight && x > r.skylight[0] - 0.3 && x < r.skylight[2] + 0.3 && z > r.skylight[1] - 0.3 && z < r.skylight[3] + 0.3) continue;
        S.cyl(0.14, 0.14, 0.012, x, ceil, z, th.lamp, { glow: 1, tess: 10 });
      }
    }
    if (th.cove || r.tall) {
      const y = r.y + r.h - 0.04;
      const i = 0.18;
      for (const [w, d, x, z] of [[r.x1 - r.x0 - 0.4, 0.04, (r.x0 + r.x1) / 2, r.z0 + i], [r.x1 - r.x0 - 0.4, 0.04, (r.x0 + r.x1) / 2, r.z1 - i], [0.04, r.z1 - r.z0 - 0.4, r.x0 + i, (r.z0 + r.z1) / 2], [0.04, r.z1 - r.z0 - 0.4, r.x1 - i, (r.z0 + r.z1) / 2]]) {
        S.box(w, 0.025, d, x, y, z, th.lamp, { glow: 1 });
      }
      if (r.tall && !low) {
        for (let x = r.x0 + 1; x < r.x1 - 0.8; x += 1.1) for (let z = r.z0 + 1; z < r.z1 - 0.8; z += 1.1) if ((Math.round(x * 3) + Math.round(z * 7)) % 3 === 0) S.cyl(0.06, 0.06, 0.01, x, r.y + r.h - 0.004, z, "#fff6dc", { glow: 1, tess: 6 });
      }
    }
  }

  const FURNISH = {
    living(r) {
      r.w2 = (r.x1 - r.x0) * (r.z1 - r.z0);
      ctx.ceil = r.h;
      if (th.columns) {
        for (const [x, z] of [[r.x0 + 2.5, r.z0 + 3.2], [r.x0 + 2.5, r.z1 - 3.2]]) {
          K.cyl(0.9, 0.9, r.h, x, r.y + r.h / 2, z, null, { material: fin.get("marble", "#f6f4f0", "#cfc8bc"), tess: 24 });
          K.cyl(1.1, 1.1, 0.12, x, r.y + 0.06, z, "#efebe5", { tess: 24 });
          box(x, r.y + r.h / 2, z, 0.85, r.h, 0.85);
          r.occ.push([x - 0.7, z - 0.7, x + 0.7, z + 0.7]);
        }
      }
      const group = lounge(r, { sofaW: r.w2 > 40 ? 2.9 : 2.4, depth: r.w2 > 60 ? 3.6 : 3.0 });
      if (th.modular && group?.anchor && !low) {
        const c2 = centerSpot(r, 3.2, 2.4, { margin: 0.5 });
        if (c2) {
          const pm = P(c2.x, c2.z, 0, r);
          for (const [x, z, w] of [[-1, 0.7, 2.0], [1.1, -0.4, 1.0], [-0.9, -0.7, 1.0]]) {
            pm.box(w, 0.38, 0.95, x, 0.19, z, th.fabric);
            pm.box(w - 0.04, 0.1, 0.9, x, 0.43, z, F.shade(th.fabric, 0.03));
          }
          pm.box(1.2, 0.3, 0.7, 0.4, 0.15, 0.1, "#e9e4dc");
          pm.solid(3.2, 0.5, 2.0, 0, 0.25, 0);
        }
      }
      if (th.modular || th.fam === "marble") {
        const bs = cornerSpots(r, 1.6)[0];
        if (bs) {
          const pb = P(bs[0], bs[1], 0, r);
          pb.ball(1.5, 0, 0.55, 0, "#8a7a68", { sy: 0.75, sx: 1.2, seg: 8 });
          pb.ball(0.8, 0.5, 0.35, 0.3, "#7a6a58", { sy: 0.6, seg: 6 });
          pb.solid(1.4, 1.1, 1.2, 0, 0.55, 0);
        }
      }
      if (th.piano && r.w2 > 30) {
        const ps = wallSpot(r, 1.7, 2.6, { prefer: (s) => (s.glass ? 2 : 0) + (s.b - s.a) * 0.01 });
        if (ps) F.piano(P(ps.x, ps.z + 0, ps.ry + Math.PI, r));
      }
      if (!rooms.some((o) => o.kind === "dining") && r.w2 > 30) {
        const c = centerSpot(r, 1.6, 0.95, { margin: 0.9 });
        if (c) F.diningSet(P(c.x, c.z, 0, r), { len: 1.6, seats: 4, ceil: r.h });
      }
      const shelf = wallSpot(r, 1.3, 0.4, { glassOk: false, windowsOk: false, tall: true });
      if (shelf) F.bookshelf(P(shelf.x, shelf.z, shelf.ry, r), { w: 1.3, h: Math.min(2.1, r.h - 0.4) });
      plants(r, th.fam === "marble" || th.fam === "jungle" || th.fam === "garden" ? 4 : 2);
      art(r, th.art === "soft" ? 1.8 : 1.2, th.art === "soft" ? 1.1 : 0.8);
      if (r.tall) F.ringChandelier(P((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0, r), 0, 0, r.h - 1.6, 1.6, { crystal: th.crystal });
    },
    kitchen(r) {
      ctx.ceil = r.h;
      const free = (s) => cutIntervals([[s.a, s.b]], s.gaps.map(([a, b]) => [a - 0.2, b + 0.2])).reduce((m, [a, b]) => Math.max(m, b - a), 0);
      let spot = null;
      for (const len of [4.6, 4.0, 3.4, 2.8]) {
        spot = wallSpot(r, len, 0.66, { glassOk: false, windowsOk: false, tall: true, prefer: (s) => free(s) });
        if (spot) {
          F.kitchenRun(P(spot.x, spot.z, spot.ry, r), { len, ceil: r.h });
          break;
        }
        spot = wallSpot(r, len, 0.66, { glassOk: false, tall: true, prefer: (s) => free(s) });
        if (spot) {
          F.kitchenRun(P(spot.x, spot.z, spot.ry, r), { len, ceil: r.h, uppers: false });
          break;
        }
      }
      if (spot) {
        const s = spot.side;
        for (const off of [1.75, 1.6]) {
          const ix = spot.x + s.nx * off;
          const iz = spot.z + s.nz * off;
          const swap = Math.abs(s.nx) > 0.5;
          const rect = swap ? [ix - 0.5, iz - 1.3, ix + 1.4, iz + 1.3] : [ix - 1.3, iz - 0.5, ix + 1.3, iz + 1.4];
          const rect2 = swap ? [ix - 1.4, iz - 1.3, ix + 0.5, iz + 1.3] : [ix - 1.3, iz - 1.4, ix + 1.3, iz + 0.5];
          const use = s.nx > 0 || s.nz > 0 ? rect : rect2;
          if (!fits(r, use)) continue;
          r.occ.push(use);
          F.island(P(ix, iz, spot.ry, r), { len: 2.4, ceil: r.h });
          break;
        }
      }
      if (!low) plants(r, 1);
      art(r, 0.7, 0.5);
    },
    dining(r) {
      ctx.ceil = r.h;
      const len = Math.min(2.6, (r.x1 - r.x0) - 3);
      const ry = r.x1 - r.x0 >= r.z1 - r.z0 ? 0 : Math.PI / 2;
      const c = centerSpot(r, Math.max(1.4, len) + 1.0, 2.4, { margin: 0.4, ry });
      if (c) F.diningSet(P(c.x, c.z, ry, r), { len: Math.max(1.4, len), seats: len > 2 ? 8 : 6, ceil: r.h, chandelier: th.crystal ? "crystal" : "linear" });
      const sb = wallSpot(r, 1.6, 0.48, { glassOk: false, windowsOk: false });
      if (sb) F.dresser(P(sb.x, sb.z, sb.ry, r), { w: 1.6, mirror: false });
      art(r, 1.2, 0.8);
      plants(r, 2);
    },
    roomService(r) {
      ctx.ceil = r.h;
      const c = centerSpot(r, 1.2, 1.2, { margin: 0.8 });
      if (c) F.diningSet(P(c.x, c.z, 0, r), { len: 1.2, seats: 4, round: true, ceil: r.h });
      const cart = wallSpot(r, 0.9, 0.6, {});
      if (cart) F.deskCart(P(cart.x, cart.z, cart.ry, r));
      const sb = wallSpot(r, 1.4, 0.48, { glassOk: false });
      if (sb) {
        F.dresser(P(sb.x, sb.z, sb.ry, r), { w: 1.4, mirror: false });
        const pm = P(sb.x, sb.z, sb.ry, r);
        pm.box(0.5, 0.42, 0.4, -0.35, 1.03, 0, "#2a2c31");
        pm.box(0.44, 0.34, 0.01, -0.35, 1.03, -0.205, "#ffe7a8", { glow: 0.6 });
      }
      art(r);
      plants(r, 1);
    },
    bedroom(r) {
      ctx.ceil = r.h;
      const main = r.main || (r.x1 - r.x0) * (r.z1 - r.z0) > 28;
      const bw = main ? 1.8 : 1.6;
      const opp = (s) => (s.gaps.length ? 0 : 3) + (s.glass ? -2 : 0) + (s.windows.length ? -0.5 : 0) + (s.b - s.a) * 0.1;
      const spot = wallSpot(r, bw + 1.2, 2.15, { prefer: opp, glassOk: false });
      if (spot) {
        const pb = P(spot.x, spot.z, spot.ry, r);
        F.rug(pb.sub(0, -0.3), { w: bw + 1.4, d: 2.6 });
        F.bed(pb.sub(0, 0), { w: bw });
        const art2 = pb.sub(0, 1.07 - 0.02);
        F.wallArt(art2, { w: bw * 0.8, h: 0.6, y: Math.min(1.75, r.h - 0.6), motif: th.art === "soft" ? "abstract" : th.art });
        r.tallSpans.push({ side: spot.side.name, a: spot.c - bw / 2, b: spot.c + bw / 2 });
        if (main) {
          const tv = wallSpot(r, 1.6, 0.45, { prefer: (s) => (s.name === ({ z0: "z1", z1: "z0", x0: "x1", x1: "x0" })[spot.side.name] ? 5 : 0), glassOk: false, windowsOk: false, tall: true });
          if (tv) F.mediaWall(P(tv.x, tv.z, tv.ry, r), { w: 1.6, tv: 1.2 });
        }
      }
      const wd = wallSpot(r, 1.6, 0.6, { glassOk: false, windowsOk: false, tall: true });
      if (wd) F.wardrobe(P(wd.x, wd.z, wd.ry, r), { w: 1.6 });
      const dr = wallSpot(r, 1.2, 0.48, { glassOk: false });
      if (dr) F.dresser(P(dr.x, dr.z, dr.ry, r), { w: 1.2 });
      const ch = cornerSpots(r, 0.9)[0];
      if (ch) F.armchair(P(ch[0], ch[1], Math.atan2((r.x0 + r.x1) / 2 - ch[0], (r.z0 + r.z1) / 2 - ch[1]) + Math.PI, r), { wood: th.sofaWood });
      plants(r, 1);
    },
    kids(r) {
      ctx.ceil = r.h;
      const spot = wallSpot(r, 1.1, 2.0, { glassOk: false });
      const bright = ["#ff6fa5", "#ffd23f", "#59c3ff", "#7ee0c3"];
      if (spot) F.bed(P(spot.x, spot.z, spot.ry, r), { w: 1.0, l: 1.95, duvet: th.fam === "spooky" ? "#5a4a6e" : bright[2], kid: true, nightstands: false });
      const dk = wallSpot(r, 1.2, 0.65, {});
      if (dk) F.desk(P(dk.x, dk.z, dk.ry, r), { w: 1.2, gamer: th.neon });
      const c = centerSpot(r, 1.6, 1.6, { margin: 0.3 });
      if (c) {
        F.rug(P(c.x, c.z, 0, r), { w: 1.8, round: true, hex: bright[0] });
        if (!low) {
          const pt = P(c.x, c.z, 0, r);
          bright.forEach((hex, i) => pt.box(0.25, 0.25, 0.25, Math.sin(i * 1.7) * 0.5, 0.125 + (i === 3 ? 0.25 : 0), Math.cos(i * 1.7) * 0.5 * (i === 3 ? 0 : 1), hex));
        }
      }
      const bb = cornerSpots(r, 0.8)[0];
      if (bb) P(bb[0], bb[1], 0, r).ball(0.8, 0, 0.3, 0, bright[1], { sy: 0.7 });
      const sh = wallSpot(r, 1.0, 0.36, { tall: true, windowsOk: false });
      if (sh) F.bookshelf(P(sh.x, sh.z, sh.ry, r), { w: 1.0, h: 1.2 });
      art(r, 0.8, 0.6);
    },
    bath(r) {
      ctx.ceil = r.h;
      const area = (r.x1 - r.x0) * (r.z1 - r.z0);
      const big = area > 14;
      const vw = big ? 1.6 : 1.0;
      const v = wallSpot(r, vw, 0.52, { windowsOk: true, tall: true, prefer: (s) => (s.windows.length ? 0 : 2) + (s.b - s.a) * 0.1 });
      if (v) F.vanity(P(v.x, v.z, v.ry, r), { w: vw, double: big });
      const tb = big ? wallSpot(r, 1.75, 0.82, {}) : null;
      if (tb) F.tub(P(tb.x, tb.z, tb.ry, r), { l: 1.7 });
      const sh = !tb || area > 18 ? wallSpot(r, 1.0, 1.0, {}) : null;
      if (sh) F.shower(P(sh.x, sh.z, sh.ry, r));
      const to = wallSpot(r, 0.6, 0.75, {});
      if (to) F.toilet(P(to.x, to.z, to.ry, r));
      const tw = wallFace(r, 0.6);
      if (tw) F.towel(P(tw.x, tw.z, tw.ry, r), 0, -0.02);
      const c = centerSpot(r, 0.8, 0.5, { margin: 0.2 });
      if (c) P(c.x, c.z, 0, r).box(0.8, 0.012, 0.5, 0, 0.006, 0, th.towel);
      if (!low) plants(r, 1);
    },
    hall(r) {
      ctx.ceil = r.h;
      const cs = wallSpot(r, 1.2, 0.38, { glassOk: false, windowsOk: false });
      if (cs) {
        const pc = P(cs.x, cs.z, cs.ry, r);
        pc.box(1.2, 0.04, 0.38, 0, 0.8, 0, th.wood);
        for (const x of [-0.56, 0.56]) pc.box(0.04, 0.78, 0.34, x, 0.39, 0, th.metalDark);
        pc.box(0.8, 1.0, 0.03, 0, 1.45, 0.17, th.metal);
        pc.box(0.74, 0.94, 0.01, 0, 1.45, 0.155, "#d9eef7", { glow: 0.15 });
        if (!low) F.vase(pc, -0.35, 0.82, 0);
        F.tableLamp(pc, 0.4, 0.82, 0);
        pc.solid(1.2, 0.82, 0.38, 0, 0.41, 0);
      }
      const long = Math.max(r.x1 - r.x0, r.z1 - r.z0);
      if (long > 5) {
        const alongX = r.x1 - r.x0 > r.z1 - r.z0;
        const ry = alongX ? Math.PI / 2 : 0;
        const [a, b] = alongX ? [r.x0 + 1, r.x1 - 1] : [r.z0 + 1, r.z1 - 1];
        const cut = shaft && overlaps(shaft.r, [r.x0, r.z0, r.x1, r.z1]) ? [alongX ? [shaft.r[0] - 1.6, shaft.r[2] + 1.6] : [shaft.r[1] - 1.6, shaft.r[3] + 1.6]] : [];
        const [p, q] = cutIntervals([[a, b]], cut).sort((u, v) => v[1] - v[0] - (u[1] - u[0]))[0] ?? [a, a];
        const mid = (p + q) / 2;
        if (q - p > 2) F.rug(P(alongX ? mid : (r.x0 + r.x1) / 2, alongX ? (r.z0 + r.z1) / 2 : mid, ry, r), { w: 1.0, d: q - p, hex: th.fam === "grand" || th.fam === "castle" ? "#8a1f2e" : th.rug });
      }
      if (r.id === "corridor") {
        for (let x = r.x0 + 2.5; x < r.x1 - 1.5; x += 4.5) {
          const pd = P(x, r.z0 + T / 2 + 0.03, Math.PI, r);
          pd.box(1.0, 2.1, 0.04, 0, 1.05, 0, th.door);
          pd.box(1.14, 2.17, 0.03, 0, 1.085, 0.01, th.trim);
          pd.box(0.12, 0.03, 0.06, 0.38, 1.0, -0.04, th.metal);
          pd.box(0.2, 0.12, 0.02, 0, 1.55, -0.03, th.metal, { glow: 0.3 });
          pd.box(0.06, 0.5, 0.12, -0.75, 1.9, -0.05, "#fff1d0", { glow: 0.9 });
        }
        const cart = wallSpot(r, 0.9, 0.6, {});
        if (cart) F.deskCart(P(cart.x, cart.z, cart.ry, r));
        const ice = wallSpot(r, 0.7, 0.6, {});
        if (ice) {
          const pi = P(ice.x, ice.z, ice.ry, r);
          pi.box(0.7, 1.5, 0.6, 0, 0.75, 0, "#c9ced4");
          pi.box(0.4, 0.2, 0.02, 0, 1.2, -0.31, "#59c3ff", { glow: 0.8 });
          pi.solid(0.7, 1.5, 0.6, 0, 0.75, 0);
        }
      }
      plants(r, 2);
      art(r, 0.9, 0.65);
    },
    entrance(r) {
      ctx.ceil = r.h;
      F.ringChandelier(P((r.x0 + r.x1) / 2, r.z0 + 3.2, 0, r), 0, 0, r.h - 1.8, 2.0, { crystal: th.crystal || th.fam === "hollywood" });
      const c = centerSpot(r, 1.4, 1.4, { margin: 0.9 });
      if (c && !th.castle) {
        const pt = P(c.x, c.z, 0, r);
        pt.cyl(1.3, 1.3, 0.05, 0, 0.78, 0, "#2a2c31", { tess: 28 });
        pt.cyl(0.5, 0.7, 0.76, 0, 0.38, 0, th.metal, { tess: 18 });
        F.vase(pt, 0, 0.8, 0, { hex: "#f4f1ea" });
        pt.solid(1.3, 0.8, 1.3, 0, 0.4, 0);
      }
      if (th.castle) {
        for (const x of [r.x0 + 1.0, r.x1 - 1.0]) {
          const pa = P(x, r.z0 + 2.5, x < 0 ? -Math.PI / 2 : Math.PI / 2, r);
          pa.cyl(0.5, 0.6, 0.2, 0, 0.1, 0, "#6e665a");
          pa.cyl(0.3, 0.35, 0.9, 0, 0.65, 0, "#b9c0c7");
          pa.box(0.5, 0.65, 0.3, 0, 1.4, 0, "#b9c0c7");
          pa.ball(0.32, 0, 1.92, 0, "#b9c0c7", { sy: 1.2 });
          pa.box(0.06, 1.6, 0.06, 0.32, 1.2, -0.1, "#5a5f66");
          pa.solid(0.6, 2.0, 0.6, 0, 1, 0);
        }
      }
      if (th.hollywood) P((r.x0 + r.x1) / 2, r.z0 + 2.2, 0, r).cyl(1.5, 1.5, 0.012, 0, 0.007, 0, "#d4a017", { tess: 5, glow: 0.3 });
      F.rug(P((r.x0 + r.x1) / 2, r.z0 + 2.2, 0, r), { w: 2.4, d: 3.0, hex: th.fam === "grand" || th.castle || th.hollywood ? "#8a1f2e" : th.rug });
      plants(r, 4);
      art(r, 1.4, 1.0);
    },
    gallery(r) {
      ctx.ceil = r.h;
      const s = wallSpot(r, 2.0, 0.9, { glassOk: false });
      if (s) F.sofa(P(s.x, s.z, s.ry, r), { w: 2.0, d: 0.85 });
      plants(r, 2);
      art(r, 1.6, 0.9);
    },
    mezzanine(r) {
      ctx.ceil = r.h;
      const shelf = wallSpot(r, 2.4, 0.4, { glassOk: false, windowsOk: false, tall: true });
      if (shelf) F.bookshelf(P(shelf.x, shelf.z, shelf.ry, r), { w: 2.4, h: Math.min(2.2, r.h - 0.3) });
      const c = centerSpot(r, 2.6, 1.6, { margin: 0.4 });
      if (c) {
        const pc = P(c.x, c.z, 0, r);
        F.rug(pc, { w: 2.8, d: 2.0 });
        F.armchair(pc.sub(-0.8, 0.2, Math.PI * 0.85));
        F.armchair(pc.sub(0.8, 0.2, -Math.PI * 0.85));
        F.coffeeTable(pc.sub(0, -0.5), { w: 0.6, round: true });
      }
      const fl = wallSpot(r, 0.5, 0.5, {});
      if (fl) F.floorLamp(P(fl.x, fl.z, fl.ry, r), 0, 0);
      plants(r, 2);
      art(r);
    },
    sitting(r) {
      FURNISH.living(r);
      const dk = wallSpot(r, 1.3, 0.65, { glassOk: true });
      if (dk) F.desk(P(dk.x, dk.z, dk.ry, r), { w: 1.3 });
    },
    game(r) {
      ctx.ceil = r.h;
      const c = centerSpot(r, 2.5, 1.4, { margin: 1.0, ry: r.x1 - r.x0 > r.z1 - r.z0 ? 0 : Math.PI / 2 });
      if (c) F.poolTable(P(c.x, c.z, c.ry, r));
      const screens = ["#59f3ff", "#ff4dd8", "#ffd23f"];
      for (let i = 0; i < 3; i += 1) {
        const s = wallSpot(r, 0.8, 0.8, { glassOk: false, windowsOk: false, tall: true });
        if (s) F.arcade(P(s.x, s.z, s.ry, r), screens[i]);
      }
      const tv = wallSpot(r, 2.0, 0.5, { glassOk: false, windowsOk: false, tall: true });
      if (tv) {
        F.mediaWall(P(tv.x, tv.z, tv.ry, r), { w: 2.0 });
        const s = tv.side;
        for (const off of [-0.6, 0.6]) {
          const bx = tv.x + s.nx * 2.0 + Math.abs(s.nz) * off;
          const bz = tv.z + s.nz * 2.0 + Math.abs(s.nx) * off;
          if (fits(r, [bx - 0.4, bz - 0.4, bx + 0.4, bz + 0.4])) P(bx, bz, 0, r).ball(0.8, 0, 0.32, 0, off < 0 ? th.accent : th.accent2, { sy: 0.75 });
        }
      }
      const dart = wallFace(r, 0.6);
      if (dart) {
        const pd = P(dart.x, dart.z, dart.ry, r);
        pd.cyl(0.46, 0.46, 0.04, 0, 1.7, 0, "#1d1f24", { rx: Math.PI / 2 });
        pd.cyl(0.3, 0.3, 0.045, 0, 1.7, -0.002, "#e23b4a", { rx: Math.PI / 2 });
        pd.cyl(0.1, 0.1, 0.05, 0, 1.7, -0.004, "#2f9a4a", { rx: Math.PI / 2 });
      }
      art(r, 1.0, 0.7);
      if (r.kind === "dungeon") dungeonDecor(r);
    },
    movie(r) {
      ctx.ceil = r.h;
      const wide = r.sides.filter((s) => !s.gaps.length).sort((p, q) => q.b - q.a - (p.b - p.a))[0] ?? r.sides[0];
      const len = wide.b - wide.a;
      const sw = Math.min(len - 1.6, th.hollywood ? 5.2 : 4.4);
      const spot = wallSpot(r, sw + 0.6, 0.3, { sides: [wide], glassOk: false, windowsOk: false, tall: true });
      if (!spot) return;
      const ps = P(spot.x, spot.z, spot.ry, r);
      ps.box(sw + 0.3, sw * 0.5 + 0.3, 0.05, 0, 1.0 + sw * 0.25, 0.12, "#111216");
      ps.box(sw, sw * 0.5, 0.02, 0, 1.0 + sw * 0.25, 0.09, "#cfe6ff", { glow: 0.85 });
      if (th.hollywood) {
        for (const side of [-1, 1]) {
          ps.box(0.7, r.h - 0.1, 0.12, side * (sw / 2 + 0.4), r.h / 2, 0.05, "#a0101e");
          ps.box(0.1, r.h - 0.1, 0.13, side * (sw / 2 + 0.06), r.h / 2, 0.05, "#d4a017", { glow: 0.2 });
        }
        ps.box(sw + 1.4, 0.3, 0.14, 0, r.h - 0.15, 0.05, "#d4a017", { glow: 0.3 });
      }
      for (const side of [-1, 1]) {
        ps.box(0.4, 1.2, 0.35, side * (sw / 2 + (th.hollywood ? 1.0 : 0.5)), 0.6, -0.05, "#1d1f24");
        ps.ball(0.22, side * (sw / 2 + (th.hollywood ? 1.0 : 0.5)), 0.9, -0.23, "#3a3d44", { sz: 0.2 });
      }
      const s = spot.side;
      const seatsX = spot.x + s.nx * 3.6;
      const seatsZ = spot.z + s.nz * 3.6;
      const per = Math.max(2, Math.min(th.hollywood ? 5 : 4, Math.floor((sw + 0.4) / 0.85)));
      const rows = th.hollywood ? 3 : 2;
      const sr = [seatsX - 2.4, seatsZ - 2.4, seatsX + 2.4, seatsZ + 2.4];
      r.occ.push(sr);
      F.cinemaSeats(P(seatsX, seatsZ, spot.ry + Math.PI, r), { rows, per });
      const pop = cornerSpots(r, 0.7)[0];
      if (pop) {
        const pp = P(pop[0], pop[1], 0, r);
        pp.box(0.6, 0.8, 0.5, 0, 0.4, 0, "#c8102e");
        pp.box(0.56, 0.6, 0.46, 0, 1.1, 0, "#e8f7ff", { alpha: 0.5 });
        pp.box(0.5, 0.35, 0.4, 0, 1.0, 0, "#ffe7a8", { glow: 0.4 });
        pp.box(0.6, 0.12, 0.5, 0, 1.46, 0, "#c8102e");
        pp.solid(0.6, 1.5, 0.5, 0, 0.75, 0);
      }
      for (let i = 0; i < 2; i += 1) {
        const po = wallFace(r, 0.8);
        if (!po) break;
        const pq = P(po.x, po.z, po.ry, r);
        pq.box(0.7, 1.0, 0.03, 0, 1.55, 0, "#111216");
        pq.box(0.62, 0.92, 0.01, 0, 1.55, -0.02, ["#ffd23f", "#59c3ff"][i], { glow: 0.5 });
        pq.box(0.06, 0.2, 0.08, -0.5, 1.8, -0.04, "#fff1d0", { glow: 0.9 });
      }
    },
    gym(r) {
      ctx.ceil = r.h;
      const t1 = wallSpot(r, 0.9, 1.9, {});
      if (t1) F.treadmill(P(t1.x, t1.z, t1.ry, r));
      const w1 = wallSpot(r, 1.4, 0.45, { windowsOk: false });
      if (w1) F.weights(P(w1.x, w1.z, w1.ry, r));
      const mir = wallFace(r, 2.4);
      if (mir) {
        const pm = P(mir.x, mir.z, mir.ry, r);
        pm.box(2.4, 1.9, 0.02, 0, 1.25, 0, "#d9eef7", { glow: 0.15 });
      }
      const c = centerSpot(r, 0.7, 1.8, { margin: 0.3 });
      if (c) P(c.x, c.z, 0, r).box(0.7, 0.01, 1.8, 0, 0.006, 0, th.accent);
      plants(r, 1);
    },
    garage(r) {
      ctx.ceil = r.h;
      const ry = r.z1 - r.z0 >= r.x1 - r.x0 ? 0 : Math.PI / 2;
      const c = centerSpot(r, 1.9, 4.4, { margin: 0.5, ry });
      if (c) F.car(P(c.x, c.z, ry, r), { paint: th.fam === "hollywood" ? "#c8102e" : th.fam === "villa" || th.fam === "beach" ? "#f4f1ea" : style.accent });
      const wb = wallSpot(r, 2.0, 0.7, { windowsOk: false, tall: true });
      if (wb) F.workbench(P(wb.x, wb.z, wb.ry, r), { w: 2.0 });
      const sh = wallSpot(r, 1.4, 0.45, { tall: true });
      if (sh) {
        const ps = P(sh.x, sh.z, sh.ry, r);
        for (let i = 0; i < 4; i += 1) ps.box(1.4, 0.03, 0.45, 0, 0.3 + i * 0.5, 0, "#5a5f66");
        for (const x of [-0.68, 0.68]) ps.box(0.04, 1.9, 0.45, x, 0.95, 0, "#3a3d44");
        if (!low) for (let i = 0; i < 6; i += 1) ps.box(0.3, 0.25, 0.3, -0.45 + (i % 3) * 0.45, 0.45 + Math.floor(i / 3) * 0.5, 0, ["#e23b4a", "#c9a27a", "#3a6bd6"][i % 3]);
        ps.solid(1.4, 1.9, 0.45, 0, 0.95, 0);
      }
      const door = r.sides.find((s) => s.name === "z0");
      if (door) {
        const w = Math.min(4.6, r.x1 - r.x0 - 1);
        const pd = P((r.x0 + r.x1) / 2, r.z0 + T / 2 + 0.03, Math.PI, r);
        pd.box(w, 2.3, 0.04, 0, 1.15, 0, "#e9e6e1");
        for (let i = 1; i < 6; i += 1) pd.box(w, 0.02, 0.05, 0, (2.3 / 6) * i, 0, "#c9c5bb");
      }
      P(r.x1 - 0.4, (r.z0 + r.z1) / 2, Math.PI / 2, r).box(0.25, 0.4, 0.12, 0, 1.2, 0.3, "#2a2c31");
    },
    balcony(r) {
      const c = centerSpot(r, 1.6, 0.8, { margin: 0.1 });
      if (c) {
        const pc = P(c.x, c.z, 0, r);
        pc.cyl(0.7, 0.7, 0.04, 0, 0.72, 0, "#2a2c31", { tess: 16 });
        pc.cyl(0.06, 0.06, 0.7, 0, 0.36, 0, "#2a2c31");
        F.chair(pc, -0.6, 0, -Math.PI / 2, "#e9e6e1");
        F.chair(pc, 0.6, 0, Math.PI / 2, "#e9e6e1");
        if (!low) F.vase(pc, 0, 0.74, 0);
      }
      for (const [x, z] of cornerSpots(r, 0.6)) F.plantPot(P(x, z, 0, r), 0, 0, "small");
      const lg = wallSpot(r, 0.7, 1.9, {});
      if (lg) F.lounger(P(lg.x, lg.z, lg.ry, r));
    },
    backyard(r) {
      const pc = centerSpot(r, 2.2, 2.2, { margin: 0.6 });
      if (pc) {
        F.diningSet(P(pc.x, pc.z, 0, r), { len: 1.2, seats: 4, round: true, ceil: 4, chandelier: "none" });
        F.umbrella(P(pc.x, pc.z, 0, r), 0, 0);
      }
      const bq = wallSpot(r, 1.2, 0.6, {});
      if (bq) F.bbq(P(bq.x, bq.z, bq.ry, r));
      for (let i = 0; i < 2; i += 1) {
        const lg = wallSpot(r, 0.7, 1.9, {});
        if (lg) F.lounger(P(lg.x, lg.z, lg.ry, r));
      }
      for (const [x, z] of cornerSpots(r, 1.0)) F.planter(P(x, z, 0, r), { w: 1.0 });
      if (th.fam === "beach") {
        for (let i = 0; i < 3; i += 1) {
          const s = wallSpot(r, 0.6, 0.15, {});
          if (s) P(s.x, s.z, s.ry, r).box(0.55, 2.2, 0.08, 0, 1.1, 0, ["#ff8a5a", "#3ec6ff", "#ffd23f"][i], { rx: -0.15 });
        }
      }
    },
    terrace(r) {
      ctx.ceil = 3;
      if (L.hottub) {
        const { x, z } = L.hottub;
        const ph = P(x, z, 0, r);
        ph.box(2.2, 0.75, 2.2, 0, 0.375, 0, "#3a3d44");
        ph.box(1.9, 0.02, 1.9, 0, 0.66, 0, "#4fd0f0", { glow: 0.5, alpha: 0.85 });
        ph.solid(2.2, 0.75, 2.2, 0, 0.375, 0);
        r.occ.push([x - 1.3, z - 1.3, x + 1.3, z + 1.3]);
      }
      const c = centerSpot(r, 4.2, 4.2, { margin: 0.2 });
      if (c) {
        const pc = P(c.x, c.z, 0, r);
        F.rug(pc, { w: 4.6, d: 4.6, hex: "#8d8f94" });
        flames.push(...F.firePit(pc, { w: 1.3, d: 0.9 }));
        F.sofa(pc.sub(0, 1.7, 0), { w: 2.8, fabric: "#c9c5bd", pillows: ["#e9e6e1", "#8d8f94"] });
        F.sofa(pc.sub(-1.75, 0, -Math.PI / 2), { w: 2.4, fabric: "#c9c5bd", pillows: ["#e9e6e1", "#8d8f94"] });
        F.sofa(pc.sub(1.75, 0, Math.PI / 2), { w: 2.4, fabric: "#c9c5bd", pillows: ["#e9e6e1", "#8d8f94"] });
        if (!low) pc.box(4.6, 0.02, 0.04, 0, 0.02, -2.3, "#ffcf6a", { glow: 1 });
      }
      const pg = centerSpot(r, 3.6, 2.8, { margin: 0.2 });
      if (pg) {
        const pp = P(pg.x, pg.z, 0, r);
        F.pergola(pp, { w: 3.6, d: 2.8 });
        F.diningSet(pp, { len: 1.8, seats: 6, ceil: 2.7, chandelier: "none" });
      }
      for (let i = 0; i < 4; i += 1) {
        const s = wallSpot(r, 1.0, 1.0, {});
        if (s) F.planter(P(s.x, s.z, s.ry, r), { w: 1.0, tree: i % 2 === 0 });
      }
      for (let i = 0; i < 2; i += 1) {
        const s = wallSpot(r, 0.7, 1.9, {});
        if (s) F.lounger(P(s.x, s.z, s.ry, r));
      }
    },
    poolDeck(r) {
      for (let i = 0; i < (r.x1 - r.x0 > 20 ? 6 : 3); i += 1) {
        const s = wallSpot(r, 0.8, 2.0, { prefer: (sd) => (sd.name === "z0" ? 0 : 1) });
        if (s) F.lounger(P(s.x, s.z, s.ry, r));
      }
      for (let i = 0; i < 2; i += 1) {
        const u = wallSpot(r, 0.8, 0.8, {});
        if (u) F.umbrella(P(u.x, u.z, 0, r), 0, 0, th.fam === "villa" ? "#ffffff" : th.accent);
      }
      if (r.x1 - r.x0 > 20) {
        const c = centerSpot(r, 4.2, 3.6, { margin: 0.3 });
        if (c) {
          const pc = P(c.x, c.z, 0, r);
          F.pergola(pc, { w: 4.2, d: 3.6, hex: th.fam === "villa" ? "#c9a77c" : "#2a2c31" });
          F.sofa(pc.sub(0, 1.0, 0), { w: 2.8, fabric: "#e9e6e1", pillows: [th.accent, "#ffffff"] });
          flames.push(...F.firePit(pc.sub(0, -0.4), { w: 1.2, d: 0.8 }));
        }
      }
      for (const [x, z] of cornerSpots(r, 1.0)) {
        const pp = P(x, z, 0, r);
        if (th.fam === "villa" || th.fam === "beach" || th.fam === "marble" || th.fam === "hillside") {
          pp.cyl(0.3, 0.4, 4.5, 0, 2.25, 0, "#a08060", { tess: 8 });
          for (let i = 0; i < 7; i += 1) {
            const yaw = (i / 7) * Math.PI * 2;
            pp.box(0.5, 0.04, 2.6, Math.sin(yaw) * 1.1, 4.4, Math.cos(yaw) * 1.1, "#3f8a3a", { ry: yaw, rx: 0.4 });
          }
          pp.solid(0.5, 4.5, 0.5, 0, 2.25, 0);
        } else F.planter(pp, { w: 1.0 });
      }
    },
  };
  FURNISH.dungeon = FURNISH.game;

  function dungeonDecor(r) {
    for (const s of r.sides) {
      if (s.glass) continue;
      const along = (s.a + s.b) / 2;
      const [x, z] = s.axis === "x" ? [along, s.line + s.nz * (T / 2 + 0.1)] : [s.line + s.nx * (T / 2 + 0.1), along];
      K.box(0.08, 0.3, 0.08, x, r.y + 1.9, z, "#3a3a40");
      const fl = A.cyl(0, 0.16, 0.26, x, r.y + 2.15, z, "#ff8a1f", { glow: 1 });
      flames.push(fl);
    }
    for (const [x, z] of cornerSpots(r, 0.7)) {
      const pb = P(x, z, 0, r);
      pb.cyl(0.6, 0.6, 0.8, 0, 0.4, 0, "#6b4a32", { tess: 12 });
      pb.ring(0.62, 0.03, 0, 0.2, 0, "#3a3a40");
      pb.ring(0.62, 0.03, 0, 0.6, 0, "#3a3a40");
    }
  }

  /* -------- theme motifs */
  function motif(r) {
    const ceil = r.y + r.h;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    if (r.out) return;
    if (th.neon) {
      const y = ceil - 0.12;
      const i = 0.1;
      for (const [w, d, x, z, hex] of [[r.x1 - r.x0 - 0.2, 0.04, cx, r.z0 + i, style.trim], [r.x1 - r.x0 - 0.2, 0.04, cx, r.z1 - i, style.window], [0.04, r.z1 - r.z0 - 0.2, r.x0 + i, cz, style.window], [0.04, r.z1 - r.z0 - 0.2, r.x1 - i, cz, style.trim]]) S.box(w, 0.04, d, x, y, z, hex, { glow: 1 });
    }
    if (th.stars && (!low || r.kind === "living")) {
      const n = Math.min(60, Math.round((r.x1 - r.x0) * (r.z1 - r.z0) * 0.8));
      for (let i = 0; i < n; i += 1) {
        const x = r.x0 + 0.3 + (((i * 37) % 100) / 100) * (r.x1 - r.x0 - 0.6);
        const z = r.z0 + 0.3 + (((i * 61) % 100) / 100) * (r.z1 - r.z0 - 0.6);
        S.ball(0.05 + (i % 3) * 0.03, x, ceil - 0.02, z, i % 4 ? "#fff6d2" : "#9fd4ff", { glow: 1, seg: 4 });
      }
    }
    if (th.portholes) {
      const s = wallFace(r, 0.9);
      if (s) {
        const pp = P(s.x, s.z, s.ry, r);
        pp.ring(0.8, 0.08, 0, 1.6, 0, "#9aa6b8", { rx: Math.PI / 2 });
        pp.cyl(0.72, 0.72, 0.02, 0, 1.6, 0.0, "#0b1030", { rx: Math.PI / 2, glow: 0.3 });
        if (!low) for (let i = 0; i < 6; i += 1) pp.ball(0.03, Math.sin(i * 2.3) * 0.25, 1.6 + Math.cos(i * 1.7) * 0.25, -0.02, "#ffffff", { glow: 1, seg: 3 });
      }
    }
    if (th.vines && !low) {
      for (let i = 0; i < 10; i += 1) {
        const t2 = i / 10;
        const onX = i % 2 === 0;
        const x = onX ? r.x0 + 0.15 + t2 * (r.x1 - r.x0 - 0.3) : i % 4 === 1 ? r.x0 + 0.12 : r.x1 - 0.12;
        const z = onX ? (i % 4 === 0 ? r.z0 + 0.12 : r.z1 - 0.12) : r.z0 + 0.15 + t2 * (r.z1 - r.z0 - 0.3);
        K.cyl(0.03, 0.03, 0.9 + (i % 3) * 0.3, x, ceil - 0.5 - (i % 3) * 0.15, z, "#3f7a3a", { tess: 4 });
        K.ball(0.3, x, ceil - 0.2, z, th.leaf, { seg: 5, sy: 0.5 });
      }
    }
    if (th.candy) {
      const s = wallSpot(r, 0.5, 0.5, {});
      if (s) {
        const pc = P(s.x, s.z, 0, r);
        pc.cyl(0.06, 0.06, 1.4, 0, 0.7, 0, "#ffffff");
        pc.cyl(0.8, 0.8, 0.12, 0, 1.5, 0, ["#ff4d8d", "#7ee0c3", "#ffd23f"][Math.round(cx) & 1 ? 0 : 1], { rx: Math.PI / 2, glow: 0.2 });
        pc.ring(0.55, 0.06, 0, 1.5, -0.07, "#ffffff", { rx: Math.PI / 2 });
      }
      if (!low) for (let i = 0; i < 3; i += 1) K.ball(0.25, r.x0 + 0.5 + i * 0.3, r.y + 0.12, r.z0 + 0.4, ["#ff4d8d", "#ffd23f", "#7ee0c3"][i], { sy: 0.6, glow: 0.2 });
    }
    if (th.icicles) {
      for (let x = r.x0 + 0.3; x < r.x1 - 0.2; x += low ? 1.2 : 0.6) {
        for (const z of [r.z0 + 0.12, r.z1 - 0.12]) K.cyl(0.12, 0, 0.3 + ((x * 7) % 3) * 0.1, x, ceil - 0.2, z, "#d7f3ff", { alpha: 0.85, glow: 0.3, tess: 5 });
      }
    }
    if (th.spooky) {
      for (const [x, z] of [[r.x0 + 0.3, r.z0 + 0.3], [r.x1 - 0.3, r.z1 - 0.3]]) K.box(0.6, 0.6, 0.01, x, ceil - 0.3, z, "#e8e8f0", { alpha: 0.4, ry: Math.PI / 4, rx: 0.6 });
      if (r.kind === "living" || r.kind === "hall" || r.kind === "bedroom") {
        const ghost = A.ball(0.7, cx, r.y + 1.9, cz, "#f6f3ff", { glow: 0.45, alpha: 0.85 });
        A.ball(0.12, 0, 0.05, -0.32, "#241a33", { seg: 4 }).parent = ghost;
        const ph = cx * 0.7;
        animators.push((time) => {
          ghost.position.x = cx + Math.sin(time * 0.5 + ph) * (r.x1 - r.x0) * 0.25;
          ghost.position.y = r.y + 1.9 + Math.sin(time * 1.7) * 0.2;
          ghost.position.z = cz + Math.cos(time * 0.5 + ph) * (r.z1 - r.z0) * 0.2;
        });
        const pk = wallSpot(r, 0.5, 0.5, {});
        if (pk) {
          P(pk.x, pk.z, 0, r).ball(0.5, 0, 0.2, 0, "#ff8a1f", { sy: 0.75, glow: 0.3 });
          P(pk.x, pk.z, 0, r).cyl(0.05, 0.06, 0.12, 0, 0.44, 0, "#3f7a3a");
        }
      }
    }
    if (th.castle && r.kind !== "bath") {
      for (let i = 0; i < 2; i += 1) {
        const s = wallFace(r, 0.9);
        if (!s) break;
        const pb = P(s.x, s.z, s.ry, r);
        pb.box(0.8, Math.min(2.0, r.h - 0.6), 0.02, 0, r.h - 0.3 - Math.min(2.0, r.h - 0.6) / 2, 0, "#8a1f2e");
        pb.box(0.4, 0.4, 0.022, 0, r.h - 1.0, -0.005, "#d4a017", { glow: 0.2 });
        pb.box(0.06, 0.3, 0.08, 0.6, 1.9, -0.05, "#3a3a40");
        flames.push(A.cyl(0, 0.14, 0.24, ...pb.world(0.6, -0.05).slice(0, 1), r.y + 2.12, pb.world(0.6, -0.05)[1], "#ff8a1f", { glow: 1 }));
      }
    }
    if (th.lodge && (r.kind === "living" || r.kind === "dining")) {
      const s = wallFace(r, 1.0);
      if (s) {
        const pa = P(s.x, s.z, s.ry, r);
        pa.box(0.3, 0.4, 0.06, 0, 2.0, 0, "#6b4a32");
        for (const side of [-1, 1]) {
          pa.box(0.05, 0.5, 0.05, side * 0.25, 2.3, -0.06, "#e9dfcc", { rz: side * -0.5 });
          pa.box(0.04, 0.25, 0.04, side * 0.4, 2.45, -0.06, "#e9dfcc", { rz: side * 0.2 });
        }
      }
      for (let x = r.x0 + 1; x < r.x1; x += 2) S.box(0.22, 0.22, r.z1 - r.z0, x, ceil - 0.11, cz, "#6b4a32");
    }
    if (th.beams && (r.kind === "living" || r.kind === "dining" || r.kind === "bedroom")) {
      const along = r.x1 - r.x0 > r.z1 - r.z0;
      for (let v = along ? r.x0 + 1.2 : r.z0 + 1.2; v < (along ? r.x1 : r.z1) - 0.6; v += 1.8) {
        if (along) S.box(0.2, 0.24, r.z1 - r.z0, v, ceil - 0.12, cz, th.wood);
        else S.box(r.x1 - r.x0, 0.24, 0.2, cx, ceil - 0.12, v, th.wood);
      }
    }
    if (th.aquarium && (r.kind === "living" || r.kind === "bedroom")) {
      const s = wallSpot(r, 2.6, 0.6, { glassOk: false, windowsOk: false, tall: true });
      if (s) {
        const pa = P(s.x, s.z, s.ry, r);
        pa.box(2.6, 0.6, 0.6, 0, 0.3, 0, "#1d5f8a");
        pa.box(2.5, 1.4, 0.5, 0, 1.3, 0, "#3ec6ff", { alpha: 0.45, glow: 0.5 });
        pa.box(2.6, 0.12, 0.6, 0, 2.06, 0, "#1d5f8a");
        pa.solid(2.6, 2.1, 0.6, 0, 1.05, 0);
        const [wx, wz] = pa.world(0, 0);
        const fish = [0, 1, 2, 3].map((i) => A.ball(0.18, wx, r.y + 0.9 + i * 0.22, wz, i % 2 ? "#ff8a3d" : "#ffd23f", { glow: 0.3, sz: 0.5 }));
        const ax = Math.cos(s.ry);
        const az = -Math.sin(s.ry);
        animators.push((time) => {
          fish.forEach((f, i) => {
            const u = Math.sin(time * (0.5 + i * 0.1) + i) * 1.0;
            f.position.x = wx + ax * u;
            f.position.z = wz + az * u;
          });
        });
      }
    }
    if (th.treehouse && r.kind === "living") {
      const c = centerSpot(r, 1.2, 1.2, { margin: 0.4 });
      if (c) {
        K.cyl(1.1, 1.3, r.h, c.x, r.y + r.h / 2, c.z, "#7a5a3a", { tess: 12 });
        box(c.x, r.y + r.h / 2, c.z, 1.0, r.h, 1.0);
        for (let i = 0; i < 5; i += 1) K.ball(1.4, c.x + Math.sin(i * 1.3) * 1.2, r.y + r.h - 0.4, c.z + Math.cos(i * 1.3) * 1.2, th.leaf, { sy: 0.4, seg: 6 });
      }
    }
    if (th.hollywood && r.kind !== "bath" && r.kind !== "movie") {
      const s = wallFace(r, 0.8);
      if (s) {
        const pp = P(s.x, s.z, s.ry, r);
        pp.box(0.7, 1.0, 0.03, 0, 1.6, 0, "#d4a017", { glow: 0.2 });
        pp.box(0.6, 0.9, 0.01, 0, 1.6, -0.02, "#1d1f24");
        pp.cyl(0.4, 0.4, 0.012, 0, 1.7, -0.03, "#ffd23f", { tess: 5, rx: Math.PI / 2, glow: 0.4 });
      }
    }
  }

  /* -------- view outside */
  function buildView() {
    const cx = (Math.min(...rooms.map((r) => r.x0)) + Math.max(...rooms.map((r) => r.x1))) / 2;
    const cz = (Math.min(...rooms.map((r) => r.z0)) + Math.max(...rooms.map((r) => r.z1))) / 2;
    const lift = L.lift ?? 0;
    const view = L.lift ? "city" : th.view;
    const sky = th.sky;
    const vk = createKit(scene, furnNode, mats);
    if (sky !== "day") {
      const dome = MeshBuilder.CreateSphere("ci-sky", { diameter: 900, segments: 16, sideOrientation: 1 }, scene);
      dome.parent = animNode;
      dome.position.set(cx, -lift, cz);
      dome.material = skyMaterial(scene, sky);
      dome.isPickable = false;
      dome.infiniteDistance = false;
      extra.push(dome);
    }
    const ground = view === "beach" ? "#efe2c2" : view === "garden" ? "#6fae5e" : sky === "night" ? "#151a24" : "#8a9099";
    vk.cyl(840, 840, 0.1, cx, -lift - 0.35, cz, ground, { tess: 40 });
    if (view === "city") {
      const n = low ? 28 : 64;
      const winMat = skylineMaterial(scene, sky);
      const rand = F.seeded(4242 + lift);
      for (let i = 0; i < n; i += 1) {
        const ang = rand() * Math.PI * 2;
        const dist = 45 + rand() * 220;
        const x = cx + Math.sin(ang) * dist;
        const z = cz + Math.cos(ang) * dist;
        const w = 10 + rand() * 18;
        const h = Math.max(12, lift * (0.4 + rand() * 1.2) + rand() * 30);
        const mesh = F.tiledBox(scene, w, h, w * (0.7 + rand() * 0.6), winMat, 4);
        mesh.parent = furnNode;
        mesh.position.set(x, -lift + h / 2, z);
        mesh.rotation.y = rand() * 0.6;
        if (rand() < 0.25) vk.cyl(0.3, w * 0.7, h * 0.12, x, -lift + h + h * 0.06, z, sky === "night" ? "#2a2f3a" : "#9aa3ad", { tess: 4 });
      }
      const spireHex = sky === "night" ? "#1d2230" : "#b8c0ca";
      const towers = [[cx - 130, cz + 40], [cx - 118, cz + 52]];
      for (const [x, z] of towers) {
        const h = lift + 110;
        const mesh = F.tiledBox(scene, 12, h, 12, winMat, 4);
        mesh.parent = furnNode;
        mesh.position.set(x, -lift + h / 2, z);
        vk.cyl(5, 11, 14, x, -lift + h + 7, z, spireHex, { tess: 8 });
        vk.cyl(0.2, 2.5, 26, x, -lift + h + 27, z, spireHex, { tess: 6 });
        if (sky === "night") vk.ball(1.2, x, -lift + h + 40, z, "#ff6a5a", { glow: 1, seg: 4 });
      }
      const empire = F.tiledBox(scene, 16, lift + 70, 16, winMat, 4);
      empire.parent = furnNode;
      empire.position.set(cx + 150, -lift + (lift + 70) / 2, cz - 30);
      vk.cyl(0.3, 4, 30, cx + 150, -lift + lift + 70 + 15, cz - 30, spireHex, { tess: 6 });
    } else if (view === "beach") {
      const sea = MeshBuilder.CreateGround("ci-sea", { width: 900, height: 420 }, scene);
      sea.parent = animNode;
      sea.position.set(cx, -0.5, cz + 240);
      sea.material = waterMaterial(scene, "#2fb7c9", low, 60);
      sea.isPickable = false;
      extra.push(sea);
      const rand = F.seeded(77);
      for (let i = 0; i < (low ? 8 : 20); i += 1) {
        const x = cx + (rand() - 0.5) * 160;
        const z = cz + 30 + rand() * 25;
        palm(vk, x, -0.35, z, 0.9 + rand() * 0.4);
      }
    } else {
      const rand = F.seeded(91);
      for (let i = 0; i < (low ? 14 : 36); i += 1) {
        const ang = rand() * Math.PI * 2;
        const dist = 38 + rand() * 60;
        const x = cx + Math.sin(ang) * dist;
        const z = cz + Math.cos(ang) * dist;
        const s = 1.2 + rand() * 1.4;
        vk.cyl(0.5 * s, 0.6 * s, 3 * s, x, -0.35 + 1.5 * s, z, "#7a5a3a", { tess: 6 });
        vk.ball(4.4 * s, x, -0.35 + 4.2 * s, z, rand() < 0.5 ? "#4f8a4a" : "#3f7a3a", { seg: 7 });
      }
      for (let i = 0; i < 6; i += 1) vk.ball(160, cx + Math.sin(i) * 330, -50, cz + Math.cos(i) * 330, "#6f9f62", { seg: 8, sy: 0.5 });
    }
  }

  function palm(k, x, y, z, s) {
    for (let i = 0; i < 5; i += 1) k.cyl(0.32 * s, 0.38 * s, 1.1 * s, x + i * 0.1 * s, y + 0.55 * s + i * 1.05 * s, z, "#a08060");
    for (let i = 0; i < 7; i += 1) {
      const yaw = (i / 7) * Math.PI * 2;
      k.box(0.7 * s, 0.06, 3.0 * s, x + 0.5 * s + Math.sin(yaw) * 1.3 * s, y + 5.6 * s, z + Math.cos(yaw) * 1.3 * s, "#3f8a3a", { ry: yaw, rx: 0.4 });
    }
  }

  /* -------- the ground-floor lobby under a tower home, and roof decks */
  const pseudo = (id, name, y, h, rect, o = {}) => ({ id, kind: o.out ? "terrace" : "hall", name, lv: -1, x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], y, h, windows: [], glassFaces: new Set(), occ: [], tallSpans: [], meta: ROOM_NAMES[name], ...o });

  function emitLobby(lb) {
    const { y, x0, z0, x1, z1 } = lb;
    const h = 3.6;
    const doorH = 2.5;
    const r = pseudo("lobby", "lobby", y, h, [x0, z0, x1, z1]);
    const paint = paintOf(th, { id: "lobby", kind: "hall" });
    const [fk, fhex, falt] = th.floors.default[0] === "marble" ? th.floors.default : ["marble", "#efece6", "#c9c2b6"];
    for (const rect of subtractAll([[x0, z0, x1, z1]], shaft ? [shaft.r] : [])) {
      const w = rect[2] - rect[0];
      const d = rect[3] - rect[1];
      const cx = (rect[0] + rect[2]) / 2;
      const cz = (rect[1] + rect[3]) / 2;
      sbox(w, 0.05, d, cx, y - 0.025, cz, { kind: fk, hex: fhex, alt: falt });
      solidRect(rect, y - 0.4, y);
      sbox(w, 0.2, d, cx, y + h + 0.1, cz, th.ceiling);
      solidRect(rect, y + h, y + h + 0.2);
    }
    const gap = [lb.exit - lb.exitW / 2, lb.exit + lb.exitW / 2];
    const wall = (axis, line, a, b, inside) => {
      const gaps = axis === "x" && near(line, z0) ? [gap] : [];
      const minus = inside > 0 ? th.ext : paint;
      const plus = inside > 0 ? paint : th.ext;
      for (const [p, q] of cutIntervals([[a, b]], gaps)) {
        const c = (p + q) / 2;
        if (axis === "x") box(c, y + h / 2, line, q - p, h, T);
        else box(line, y + h / 2, c, T, h, q - p);
        wallHalves(axis, line, p, q, y, y + h, minus, plus);
        baseboard(axis, line, p, q, y, inside);
      }
      for (const [p, q] of gaps) {
        box((p + q) / 2, y + doorH + (h - doorH) / 2, line, q - p, h - doorH, T);
        wallHalves(axis, line, p, q, y + doorH, y + h, minus, plus);
      }
    };
    wall("x", z0, x0 - T / 2, x1 + T / 2, 1);
    wall("x", z1, x0 - T / 2, x1 + T / 2, -1);
    wall("z", x0, z0, z1, 1);
    wall("z", x1, z0, z1, -1);
    // Glass street doors with daylight beyond; the doors stay shut, and E takes you out.
    const dc = lb.exit;
    const dw = lb.exitW;
    for (const s of [-1, 1]) glass(dw / 2 - 0.05, doorH - 0.08, 0.03, dc + (s * dw) / 4, y + doorH / 2, z0 - 0.02);
    S.box(dw + 0.12, 0.12, 0.14, dc, y + doorH, z0, th.metalDark);
    for (const s of [-1, 0, 1]) S.box(0.06, doorH, 0.1, dc + (s * dw) / 2, y + doorH / 2, z0, th.metalDark);
    if (!low) for (const s of [-1, 1]) S.box(0.03, 1.2, 0.05, dc + s * 0.08, y + 1.1, z0 + 0.03, "#d8d2c4");
    S.box(dw + 1.2, doorH + 0.8, 0.02, dc, y + doorH / 2, z0 - 0.7, "#fff3d6", { glow: 0.85 });
    S.box(dw + 1.2, 0.05, 0.7, dc, y - 0.025, z0 - 0.35, "#d9d4cc");
    box(dc, y + doorH / 2, z0 - 0.08, dw, doorH, 0.12);
    K.box(dw, 0.012, 1.1, dc, y + 0.006, z0 + 0.65, "#3a3d44");
    r.occ.push([dc - dw / 2 - 0.3, z0, dc + dw / 2 + 0.3, z0 + 1.6]);
    // Cove light round the ceiling and downlights.
    for (const [w, d, x, z] of [[x1 - x0 - 0.4, 0.04, (x0 + x1) / 2, z0 + 0.18], [x1 - x0 - 0.4, 0.04, (x0 + x1) / 2, z1 - 0.18], [0.04, z1 - z0 - 0.4, x0 + 0.18, (z0 + z1) / 2], [0.04, z1 - z0 - 0.4, x1 - 0.18, (z0 + z1) / 2]]) {
      S.box(w, 0.025, d, x, y + h - 0.04, z, th.lamp, { glow: 1 });
    }
    for (let x = x0 + 1; x < x1 - 0.6; x += low ? 2.4 : 1.6) for (let z = z0 + 1; z < z1 - 0.6; z += low ? 2.4 : 1.6) if (!inShaft(x, z, 0.3)) S.cyl(0.14, 0.14, 0.012, x, y + h - 0.005, z, th.lamp, { glow: 1, tess: 10 });
    // The front desk against the back wall, a lit feature panel behind it.
    const dx = (x0 + x1) / 2 + 0.6;
    const dz = z1 - 1.5;
    K.box(3.0, 1.05, 0.7, dx, y + 0.525, dz, th.cabinet ?? th.wood);
    K.box(3.1, 0.05, 0.8, dx, y + 1.075, dz, th.counterTop ?? "#f2efe9");
    K.box(2.9, 0.025, 0.01, dx, y + 0.92, dz - 0.36, th.lamp, { glow: 1 });
    K.ball(0.1, dx + 0.9, y + 1.14, dz - 0.15, th.metal ?? "#c9b27a", { sy: 0.6 });
    ctx.solid(dx, y + 0.55, dz, 3.1, 1.1, 0.8);
    K.box(4.4, 2.6, 0.05, dx, y + 1.75, z1 - 0.11, th.fam === "space" ? "#e8eef5" : th.wood);
    if (!low) for (let i = 0; i < 7; i += 1) K.box(0.05, 2.4, 0.03, dx - 1.95 + i * 0.65, y + 1.75, z1 - 0.15, th.accent, { glow: 0.25 });
    K.cyl(0.9, 0.9, 0.03, dx, y + 2.1, z1 - 0.16, th.accent, { rx: Math.PI / 2, glow: 0.6, tess: 24 });
    r.occ.push([dx - 1.8, dz - 1.2, dx + 1.8, z1]);
    // A lounge by the west wall: two sofas facing over a rug and a coffee table, under a chandelier.
    const lx = x0 + 2.6;
    const lz = (z0 + z1) / 2 - 0.3;
    F.rug(P(lx, lz, 0, r), { w: 3.2, d: 3.4 });
    F.sofa(P(lx, lz + 1.3, 0, r), { w: 2.2 });
    F.sofa(P(lx, lz - 1.3, Math.PI, r), { w: 2.2 });
    F.coffeeTable(P(lx, lz, 0, r), { w: 1.1, top: th.wood });
    ctx.ceil = h;
    F.ringChandelier(P((x0 + x1) / 2, (z0 + z1) / 2 + 0.4, 0, r), 0, 0, h - 1.5, 1.8, { crystal: true });
    const plants = th.plants ?? ["fiddle"];
    [[x0 + 0.6, z1 - 0.6], [x1 - 0.6, z1 - 0.6], [dc - dw / 2 - 0.6, z0 + 0.6], [dc + dw / 2 + 0.6, z0 + 0.6]].forEach(([x, z], i) => {
      if (inShaft(x, z, 1.4) || x < x0 + 0.4 || x > x1 - 0.4) return;
      F.plantPot(P(x, z, 0, r), 0, 0, plants[i % plants.length]);
    });
    rooms.push(r);
    return { ...r, exit: { x: dc, y, z: z0 + 0.9 } };
  }

  function emitRoof(rf) {
    const y = rf.y;
    const under = rf.under ?? y - 0.3;
    const [dk, dhex, dalt] = th.floors.out ?? ["deck", "#a8784e", "#000"];
    for (const rect of subtractAll(rf.rects, floorCut(y))) {
      const w = rect[2] - rect[0];
      const d = rect[3] - rect[1];
      const cx = (rect[0] + rect[2]) / 2;
      const cz = (rect[1] + rect[3]) / 2;
      sbox(w, 0.05, d, cx, y - 0.025, cz, { kind: dk, hex: dhex, alt: dalt });
      if (y - 0.05 - under > 0.01) S.box(w + 0.1, y - 0.05 - under, d + 0.1, cx, (under + y - 0.05) / 2, cz, th.ext);
      solidRect(rect, under, y);
    }
    for (const [ax, az, bx2, bz2] of rf.edges) {
      const alongX = near(az, bz2);
      const line = alongX ? az : ax;
      const [a, b] = alongX ? [Math.min(ax, bx2), Math.max(ax, bx2)] : [Math.min(az, bz2), Math.max(az, bz2)];
      const cuts = [];
      if (shaft) {
        const [sx0, sz0, sx1, sz1] = shaft.r;
        if (alongX && line > sz0 - 0.4 && line < sz1 + 0.4) cuts.push([sx0 - 0.2, sx1 + 0.2]);
        if (!alongX && line > sx0 - 0.4 && line < sx1 + 0.4) cuts.push([sz0 - 0.2, sz1 + 0.2]);
      }
      for (const [p, q] of cutIntervals([[a, b]], cuts)) glassRail(alongX ? "x" : "z", line, p, q, y);
    }
    const [rx0, rz0, rx1, rz1] = rf.rects[0];
    const r = pseudo("roof", "roofDeck", y, 3, rf.rects[0], { out: true });
    ctx.ceil = 3;
    for (let x = rx0 + 1.5; x <= rx1 - 1.5; x += 2) {
      if (inShaft(x, rz1 - 1.4, 1.6)) continue;
      F.lounger(P(x, rz1 - 1.4, Math.PI, r));
      if (Math.round((x - rx0 - 1.5) / 2) % 2 === 1) F.umbrella(P(x - 1, rz1 - 0.9, 0, r), 0, 0);
    }
    const cx = (rx0 + rx1) / 2 - 1.5;
    const cz = (rz0 + rz1) / 2 - 4;
    F.rug(P(cx, cz, 0, r), { w: 3.0, d: 3.6, hex: "#8d8f94" });
    F.sofa(P(cx, cz + 1.5, 0, r), { w: 2.2 });
    F.sofa(P(cx, cz - 1.5, Math.PI, r), { w: 2.2 });
    if (th.fam === "hillside" || th.fam === "lux") flames.push(...F.firePit(P(cx, cz, 0, r), { w: 1.2, d: 0.8 }));
    else F.coffeeTable(P(cx, cz, 0, r), { w: 1.1, top: th.wood });
    for (const [x, z] of [[rx0 + 0.7, rz0 + 0.7], [rx1 - 0.7, rz0 + 0.7], [rx0 + 0.7, rz1 - 0.7], [rx1 - 0.7, rz1 - 0.7]]) {
      if (!inShaft(x, z, 1.6)) F.planter(P(x, z, 0, r), { w: 0.9 });
    }
    for (const rect of rf.rects) rooms.push(pseudo("roof", "roofDeck", y, 3, rect, { out: true }));
  }

  /* -------- build everything */
  emitWalls();
  emitCurves();
  emitFloors();
  emitStairs();
  emitRails();
  emitPools();
  emitSlide();
  for (const r of rooms) prepRoom(r);
  if (shaft) {
    const [sx0, sz0, sx1, sz1] = shaft.r;
    const pad = [sx0 - 0.35, sz0 - 0.35, sx1 + 0.35, sz1 + 0.35];
    for (const r of rooms) {
      if (r.y > shaft.hi + 2.5 || r.y + r.h < shaft.lo) continue;
      if (overlaps(pad, [r.x0, r.z0, r.x1, r.z1])) r.occ.push(pad);
      for (const s of L.elevator.stops) {
        if (Math.abs(s.y - r.y) > 0.05) continue;
        const zone = { x0: [sx0 - 1.5, sz0 - 0.3, sx0, sz1 + 0.3], x1: [sx1, sz0 - 0.3, sx1 + 1.5, sz1 + 0.3], z0: [sx0 - 0.3, sz0 - 1.5, sx1 + 0.3, sz0], z1: [sx0 - 0.3, sz1, sx1 + 0.3, sz1 + 1.5] }[s.side];
        if (overlaps(zone, [r.x0, r.z0, r.x1, r.z1])) r.occ.push(zone);
      }
    }
  }
  const order = rooms.slice().sort((p, q) => (q.kind === "living" ? 1 : 0) - (p.kind === "living" ? 1 : 0));
  for (const r of order) {
    ctx.ceil = r.h;
    (FURNISH[r.kind] ?? FURNISH.hall)(r);
    if (!r.out) {
      ceilingLights(r);
      curtains(r);
      motif(r);
    }
  }
  buildView();
  const lift = L.elevator ? buildElevator(scene, { root, base, mats, shell: S, solid: (x, y, z, w, h, d) => box(x, y, z, w, h, d), spec: L.elevator, look: elevatorLook(th.fam), low }) : null;
  const lobby = L.lobby ? emitLobby(L.lobby) : null;
  if (L.roof) emitRoof(L.roof);

  const exitDoor = doors.find((d) => d.exit);
  const exitRoom = rooms.find((r) => r.lv === exitDoor.lv && !r.out && (exitDoor.axis === "x" ? (near(r.z0, exitDoor.line) || near(r.z1, exitDoor.line)) && exitDoor.c > r.x0 && exitDoor.c < r.x1 : (near(r.x0, exitDoor.line) || near(r.x1, exitDoor.line)) && exitDoor.c > r.z0 && exitDoor.c < r.z1));
  let nx = 0;
  let nz = 0;
  if (exitDoor.axis === "x") nz = near(exitRoom.z0, exitDoor.line) ? 1 : -1;
  else nx = near(exitRoom.x0, exitDoor.line) ? 1 : -1;
  const dx = exitDoor.axis === "x" ? exitDoor.c : exitDoor.line;
  const dz = exitDoor.axis === "x" ? exitDoor.line : exitDoor.c;
  const doorY = levels[exitDoor.lv].y;

  const shellMeshes = mergeByMaterial(shellNode, holder);
  for (const mesh of shellMeshes) mesh.metadata = { blocksCamera: true };
  const furnMeshes = mergeByMaterial(furnNode, holder);
  shellNode.dispose();
  furnNode.dispose();
  const body = new PhysicsBody(root, PhysicsMotionType.STATIC, false, scene);
  body.shape = container;
  body.setMassProperties({ mass: 0 });
  body.disablePreStep = true;

  if (!low) {
    const lit = [...shellMeshes, ...furnMeshes];
    const big = rooms.filter((r) => !r.out).sort((p, q) => (q.x1 - q.x0) * (q.z1 - q.z0) - (p.x1 - p.x0) * (p.z1 - p.z0)).slice(0, 2);
    for (const r of big) {
      const light = new PointLight("ci-light", new Vector3(base.x + (r.x0 + r.x1) / 2, base.y + r.y + r.h - 0.6, base.z + (r.z0 + r.z1) / 2), scene);
      const warm = Color3.FromHexString(th.lamp);
      light.diffuse = warm;
      light.specular = warm.scale(0.3);
      light.intensity = th.sky === "night" ? 0.7 : 0.45;
      light.range = Math.max(r.x1 - r.x0, r.z1 - r.z0) * 1.1;
      light.includedOnlyMeshes = lit;
      lights.push(light);
    }
  }

  for (const w of waters) w.id = addWater({ ...w, group: "city-interior" });

  const roomList = rooms.map((r) => ({ r, area: (r.x1 - r.x0) * (r.z1 - r.z0) })).sort((p, q) => p.area - q.area);
  let current = null;
  let pending = null;
  let pendingFor = 0;
  let lastTime = 0;
  const here = (foot) => {
    const lx = foot.x - base.x;
    const ly = foot.y - base.y;
    const lz = foot.z - base.z;
    for (const { r } of roomList) {
      if (lx < r.x0 || lx > r.x1 || lz < r.z0 || lz > r.z1) continue;
      if (ly < r.y - 0.9 || ly > r.y + r.h - 0.2) continue;
      if (r.tall && ly > levels[r.lv + 1].y - 0.4) {
        const up = rooms.find((o) => o.lv === r.lv + 1 && lx >= o.x0 && lx <= o.x1 && lz >= o.z0 && lz <= o.z1);
        if (up) return up;
      }
      return r;
    }
    for (const r of rooms) if (r.curve && lx >= r.x0 - r.curve.sag && lx <= r.x1 + r.curve.sag && lz >= r.z0 - r.curve.sag && lz <= r.z1 + r.curve.sag && ly > r.y - 0.9 && ly < r.y + r.h) return r;
    return null;
  };

  return {
    rooms,
    style,
    waters,
    spawn: {
      position: new Vector3(base.x + dx + nx * 2.7, base.y + doorY + 0.62, base.z + dz + nz * 2.7),
      heading: Math.atan2(nx, nz),
    },
    door: { x: base.x + dx + nx * 0.9, y: base.y + doorY, z: base.z + dz + nz * 0.9 },
    /** Every way out: the front door, and the lobby's street doors under a tower home. */
    exits: [
      { x: base.x + dx + nx * 0.9, y: base.y + doorY, z: base.z + dz + nz * 0.9 },
      ...(lobby ? [{ x: base.x + lobby.exit.x, y: base.y + lobby.exit.y, z: base.z + lobby.exit.z }] : []),
    ],
    /** The home's elevator (cityElevator.js), or null. */
    elevator: lift,
    /** Call every frame with the player's feet. Returns the room's { nameKey, emoji } when you walk into a new one. */
    update(time, foot) {
      const dt = Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      for (const step of animators) step(time);
      for (let i = 0; i < flames.length; i += 1) flames[i].scaling.y = 0.85 + Math.sin(time * 9 + i) * 0.12 + Math.sin(time * 13 + i * 2) * 0.08;
      for (const mesh of extra) {
        const tex = mesh.material?.diffuseTexture;
        if (tex && mesh.name !== "ci-sky") tex.uOffset = (time * 0.015) % 1;
      }
      if (secret) {
        const lx = foot.x - base.x;
        const lz = foot.z - base.z;
        const sx = secret.axis === "x" ? secret.c : secret.line;
        const sz = secret.axis === "x" ? secret.line : secret.c;
        const want = Math.hypot(lx - sx, lz - sz) < 2.6 && Math.abs(foot.y - base.y - secret.y) < 2 ? 1 : 0;
        secret.open += Math.sign(want - secret.open) * Math.min(Math.abs(want - secret.open), dt * 1.5);
        const shift = secret.open * (secret.w + 0.15);
        if (secret.axis === "x") secret.node.position.x = sx - shift;
        else secret.node.position.z = sz - shift;
      }
      const r = here(foot);
      if (!r) return null;
      if (current === null) {
        current = r;
        return null;
      }
      if (r === current) {
        pending = null;
        return null;
      }
      if (pending !== r) {
        pending = r;
        pendingFor = time;
        return null;
      }
      if (time - pendingFor < 0.25) return null;
      current = r;
      pending = null;
      return r.meta;
    },
    dispose() {
      lift?.dispose();
      for (const w of waters) if (w.id != null) removeWater(w.id);
      for (const light of lights) light.dispose();
      body.dispose();
      container.dispose();
      for (const shape of shapes) shape.dispose();
      holder.dispose();
      root.dispose();
    },
  };
}

const waterCache = new WeakMap();
function waterMaterial(scene, hex, low, tiles = 3) {
  let cache = waterCache.get(scene);
  if (!cache) {
    cache = new Map();
    waterCache.set(scene, cache);
  }
  const key = `${hex}|${tiles}`;
  let material = cache.get(key);
  if (material) return material;
  const texture = new DynamicTexture(`ci-water-${key}`, { width: 256, height: 256 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  const rand = F.seeded(5);
  ctx.strokeStyle = "#ffffff";
  for (let i = 0; i < 46; i += 1) {
    ctx.globalAlpha = 0.08 + rand() * 0.2;
    ctx.lineWidth = 1 + rand() * 2.5;
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 18, y - 7, x + 34 + rand() * 20, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = tiles;
  texture.vScale = tiles;
  material = new StandardMaterial(`ci-water-mat-${key}`, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = Color3.FromHexString(hex).scale(0.35);
  material.specularColor = new Color3(0.9, 0.9, 0.9);
  material.specularPower = 96;
  material.alpha = 0.82;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  void low;
  cache.set(key, material);
  return material;
}

const skyCache = new WeakMap();
function skyMaterial(scene, kind) {
  let cache = skyCache.get(scene);
  if (!cache) {
    cache = new Map();
    skyCache.set(scene, cache);
  }
  let material = cache.get(kind);
  if (material) return material;
  const texture = new DynamicTexture(`ci-sky-${kind}`, { width: 32, height: 256 }, scene, false);
  const ctx = texture.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  if (kind === "night") {
    g.addColorStop(0, "#050816");
    g.addColorStop(0.42, "#0d1a3a");
    g.addColorStop(0.5, "#2a3a6a");
    g.addColorStop(1, "#0a0f1c");
  } else {
    g.addColorStop(0, "#2c3e6b");
    g.addColorStop(0.3, "#6a7fb0");
    g.addColorStop(0.44, "#f2b48a");
    g.addColorStop(0.5, "#ffd9a8");
    g.addColorStop(1, "#3a3f55");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 256);
  if (kind === "night") {
    const rand = F.seeded(9);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 40; i += 1) ctx.fillRect(rand() * 32, rand() * 100, 1, 1);
  }
  texture.update();
  material = new StandardMaterial(`ci-sky-mat-${kind}`, scene);
  material.emissiveTexture = texture;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  cache.set(kind, material);
  return material;
}

function skylineMaterial(scene, sky) {
  let cache = skyCache.get(scene);
  if (!cache) {
    cache = new Map();
    skyCache.set(scene, cache);
  }
  const key = `skyline-${sky}`;
  let material = cache.get(key);
  if (material) return material;
  const night = sky === "night";
  const texture = new DynamicTexture(`ci-${key}`, { width: 128, height: 128 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = night ? "#141a28" : sky === "dusk" ? "#5a6378" : "#a9b4c2";
  ctx.fillRect(0, 0, 128, 128);
  const rand = F.seeded(21);
  for (let y = 4; y < 128; y += 10) {
    for (let x = 4; x < 128; x += 9) {
      const lit = rand() < (night ? 0.55 : sky === "dusk" ? 0.4 : 0.15);
      ctx.fillStyle = lit ? (night ? "#ffd27a" : "#ffe7b8") : night ? "#1f2738" : "#7f8ea3";
      ctx.fillRect(x, y, 6, 6);
    }
  }
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  material = new StandardMaterial(`ci-${key}-mat`, scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = night || sky === "dusk" ? texture : null;
  material.emissiveColor = night ? new Color3(1, 1, 1) : sky === "dusk" ? new Color3(0.6, 0.6, 0.6) : new Color3(0.1, 0.1, 0.1);
  material.specularColor = Color3.Black();
  material.fogEnabled = false;
  cache.set(key, material);
  return material;
}
