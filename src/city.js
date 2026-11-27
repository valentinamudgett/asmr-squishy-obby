import {
  Axis,
  Color3,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { earnCoins, refundCoins, spendCoins } from "./coins.js";
import { FREE_HOME, HOME_STYLES, HOME_TYPES, homeStyle } from "./cityHomes.js";
import { CARS, carDef, driverSeat, setCarDetail } from "./cityCars.js";
import { bindGarage } from "./cityGarage.js";
import { createPeople } from "./cityPeople.js";
import { waterAt } from "./cityWater.js";
import { recordKit } from "./cityMap.js";
import { buildCar, createKit as propKit, createMaterials, createSign, furnish, INSIDE, mergeByMaterial, OUTSIDE } from "./cityProps.js";
import { createForest } from "./cityTrees.js";
import { buildFrontDoor } from "./cityDoors.js";
import { buildInterior } from "./cityRooms.js";
import { t } from "./i18n.js";
import { FOOT_OFFSET } from "./player.js";

const SAVE_KEY = "asmr-squishy-obby:city";
const CAR_KEY = "asmr-squishy-obby:city-car";

/** Far from the course, the prison, the coaster yard, and the tower. City coordinates are relative to this. */
const OX = -2600;
const OY = 160;
const OZ = 2600;
/** Rooms are built here, well away from the streets. */
const ROOM_X = OX + 900;

/** While the streets are being built, every kit also notes its pieces here for the City map. */
let mapShapes = null;
function createKit(scene, parent, mats) {
  const kit = propKit(scene, parent, mats);
  return mapShapes ? recordKit(kit, mapShapes, { x: OX, y: OY, z: OZ }) : kit;
}
/** The walkable ground sits just above the painted roads and blocks, so feet never sink into them. */
const GROUND = 0.07;
const GROUND_HALF = 200;
/** Cars and people stay inside this square. */
const EDGE = 184;
const ROADS = [-150, -75, 0, 75, 150];
const ROAD_W = 14;
const ROAD_END = 157;
const BLOCK_HALF = 30.5;
const CENTERS = [-112.5, -37.5, 37.5, 112.5];

/** Within this long after buying, selling gives every coin back. After that you get SELL_SHARE. */
const FULL_REFUND_MS = 24 * 60 * 60 * 1000;
const SELL_SHARE = 0.8;

// Top speed, pull, and steering are per car: see CARS in cityCars.js.
const MAX_REV = 8;
const BRAKE = 26;
const COAST = 3.5;
const HANDBRAKE = 12;
const WHEELBASE = 2.6;
/** The car is two circles this big, front and back, for bumping into things. */
const CAR_R = 1.05;
const CAR_HALF = 1.0;
const WHEEL_R = 0.42;
/** Where the driver's feet go, in the car's frame. */
const SEAT = { x: -0.42, y: 0.45, z: -0.2 };
/** How far your feet sit below the seat cushion when you're in the car. */
const SEAT_RISE = 0.45;

const PIZZA_PAY = 40;
const PIZZA_BONUS = 40;
/** Deliveries faster than this earn the whole bonus, and it shrinks to nothing by twice this. */
const PIZZA_PAR = 25;

const LOTS = [
  { type: "apartment", cx: -37.5, cz: 37.5, w: 26, d: 18, h: 21, setback: 7 },
  { type: "hotel", cx: 37.5, cz: 37.5, w: 32, d: 20, h: 33, setback: 7 },
  { type: "house", cx: -37.5, cz: -37.5, w: 14, d: 11, h: 6, setback: 14 },
  { type: "penthouse", cx: 37.5, cz: -37.5, w: 20, d: 20, h: 64, setback: 9 },
  { type: "mansion", cx: -112.5, cz: -112.5, w: 34, d: 18, h: 12, setback: 24 },
].map(prepareLot);

const SHOP = prepareLot({ type: "pizza", cx: 112.5, cz: 37.5, w: 16, d: 12, h: 6, setback: 8 });
const PARK = { cx: -112.5, cz: 37.5 };
/** Left clear of buildings for the sports park (citySports.js). */
const SPORTS_PARK = { cx: 112.5, cz: 112.5 };

const ROOMS = {
  apartment: { w: 10, d: 8, h: 3.2 },
  hotel: { w: 12, d: 9, h: 3.4 },
  house: { w: 14, d: 11, h: 3.2 },
  penthouse: { w: 18, d: 13, h: 3.8 },
  mansion: { w: 26, d: 18, h: 4.6 },
};

const GENERIC = [
  { id: "city-g1", wall: "#f6d6c8", trim: "#8d6a5a", glass: "#9fd4ff" },
  { id: "city-g2", wall: "#cfe3f6", trim: "#4d6a8a", glass: "#e8f7ff" },
  { id: "city-g3", wall: "#fff1b8", trim: "#c98f2a", glass: "#9fd4ff" },
  { id: "city-g4", wall: "#d9f2dd", trim: "#4e8f5a", glass: "#bff6ff" },
  { id: "city-g5", wall: "#e8dcff", trim: "#6a5aa8", glass: "#ffe7a8" },
  { id: "city-g6", wall: "#ffd0e0", trim: "#b8487a", glass: "#e8f7ff" },
];

/** Traffic drives round these squares on the right-hand side of the road. */
const LOOPS = [
  { corners: [[-75, -75], [75, -75], [75, 75], [-75, 75]], cars: 3, speed: 10 },
  { corners: [[150, 150], [150, -150], [-150, -150], [-150, 150]], cars: 4, speed: 12 },
];
const TRAFFIC_PAINT = ["#c9ccd1", "#26406e", "#f2f2f0", "#8a1f24", "#1f2226", "#e6c229", "#3b5d48", "#7ec8ff", "#5d6670", "#c45a2a"];
const TRAFFIC_TYPES = ["sedan", "suv", "hatch", "sedan", "hatch", "suv", "sedan"];
/** People walk round each block this far from its middle, just in from the curb. */
const WALK = 30.2;
/** Palm-lined streets: along road `x` (by z) or road `z` (by x), from `from` to `to`. */
const PALM_ROWS = [
  { x: -75, from: -146, to: -4, step: 9.2, side: 8.9 },
  { z: -75, from: -146, to: -4, step: 9.2, side: 8.9 },
];
/** The cherry blossom avenue lines both sides of this street, beside the park. */
const AVENUE = { x: -75, z0: 14, z1: 57, step: 7.1, side: 8.9 };
/** By graphics setting: tree detail reach, how far people show, and how many walk about. */
const DETAIL = {
  high: { near: 65, far: 400, people: 120, walkers: 32, petals: true, shadows: true, carNear: 34, carGloss: true },
  low: { near: 30, far: 170, people: 70, walkers: 14, petals: false, shadows: false, carNear: 9, carGloss: false },
};

const held = new Set();
let hornQueued = false;
const carKey = (event) => {
  const key = event.key?.toLowerCase?.();
  if (event.code === "KeyW" || event.code === "ArrowUp" || key === "w") return "up";
  if (event.code === "KeyS" || event.code === "ArrowDown" || key === "s") return "down";
  if (event.code === "KeyA" || event.code === "ArrowLeft" || key === "a") return "left";
  if (event.code === "KeyD" || event.code === "ArrowRight" || key === "d") return "right";
  if (event.code === "Space" || event.key === " ") return "brake";
  return null;
};
const typing = (event) => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
window.addEventListener("keydown", (event) => {
  if (typing(event)) return;
  const action = carKey(event);
  if (action) held.add(action);
  if (event.code === "KeyH" && !event.repeat) hornQueued = true;
});
window.addEventListener("keyup", (event) => {
  const action = carKey(event);
  if (action) held.delete(action);
});
window.addEventListener("blur", () => held.clear());

/**
 * Squishy City. You live in a home you pick, drive your car round the streets, and deliver
 * pizzas for coins. Homes cost the same coins as the rest of the game. Saved in this browser.
 */
export function createCity(scene, { coins, graphics, quality = () => "high" }) {
  const saved = loadSave();
  const owned = new Map(saved.owned.map((entry) => [entry.id, entry]));
  let mainId = saved.main;
  /** A style you're touring, by home type. It shows on that type's lot until you pick another. */
  const previews = new Map();
  let active = false;
  let driving = false;
  let action = null;
  let actionLot = null;
  let room = null;
  let bumpWait = 0;
  let honkWait = 0;
  const pending = [];
  /** Add-ons from cityV2.js (household, taxi, airport, trips). See `use` and `host` below. */
  const addons = [];
  let addonAction = null;
  /** Your feet while you're inside a home, for its elevator's buttons. */
  let roomFoot = null;
  let addonGoal = null;
  /** While you're off on a trip (the airport, a flight, Paris), the streets hide and this runs the show. */
  let trip = null;

  const root = new TransformNode("city", scene);
  const mats = createMaterials(scene);
  const carSolids = [];
  const targets = [];
  const origin = new TransformNode("city-origin", scene);
  origin.parent = root;
  origin.position.set(OX, OY, OZ);
  const forest = createForest(scene, origin);
  const people = createPeople(scene, origin, { max: 48 });
  const streetMeshes = [];
  let detail = null;
  let forestWait = 0;
  const lookDir = new Vector3();
  let lastFoot = null;
  const lastView = { x: 1e9, z: 1e9, fx: 0, fz: 0 };

  mapShapes = [];
  buildStreets();
  forest.finish();
  for (const mesh of forest.casters) graphics?.shadow?.addShadowCaster(mesh, false);
  for (const mesh of people.sources) graphics?.shadow?.addShadowCaster(mesh, false);
  for (const lot of LOTS) addLotColliders(lot);

  const car = {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    steer: 0,
    lean: 0,
    pitch: 0,
    ride: carDef(loadCar()),
    model: null,
  };
  buildMyCar();
  parkAtHome();
  const mapLayout = mapShapes;
  mapShapes = null;
  /** The home you picked Tour for, until you go in. The map points you to it. */
  let touring = null;

  const traffic = buildTraffic();
  const markers = buildMarkers();
  const job = { phase: "idle", target: null, elapsed: 0, cooldown: 0 };
  const walkers = buildWalkers();
  const customer = people.add(9001, { mode: "idle", visible: false });

  root.setEnabled(false);

  function mainLot() {
    return lotOf(homeStyle(mainId)?.type ?? "apartment");
  }

  function lotOf(type) {
    return LOTS.find((lot) => lot.type === type) ?? LOTS[0];
  }

  function shownStyle(lot) {
    const preview = homeStyle(previews.get(lot.type));
    if (preview) return preview;
    const main = homeStyle(mainId);
    if (main?.type === lot.type) return main;
    const mine = [...owned.values()]
      .map((entry) => ({ entry, style: homeStyle(entry.id) }))
      .filter(({ style }) => style?.type === lot.type)
      .sort((a, b) => b.entry.at - a.entry.at)[0];
    return mine?.style ?? HOME_STYLES.find((style) => style.type === lot.type);
  }

  function refreshLots() {
    for (const lot of LOTS) refreshLot(lot);
  }

  function refreshLot(lot) {
    const style = shownStyle(lot);
    const mine = owned.has(style.id);
    const key = `${style.id}|${mine}|${style.id === mainId}`;
    if (key === lot.shownKey) return;
    lot.shownKey = key;
    lot.style = style;
    clearLot(lot);
    const yaw = lot.fz < 0 ? 0 : Math.PI;
    const node = new TransformNode(`city-lot-${lot.type}`, scene);
    node.parent = root;
    node.position.set(OX + lot.cx, OY, OZ + lot.zf);
    node.rotation.y = yaw;
    lot.anim = new TransformNode(`city-lot-anim-${lot.type}`, scene);
    lot.anim.parent = root;
    lot.anim.position.copyFrom(node.position);
    lot.anim.rotation.y = yaw;
    lot.holder = new TransformNode(`city-lot-mesh-${lot.type}`, scene);
    lot.holder.parent = root;
    lot.animators = [];
    const k = createKit(scene, node, mats);
    const a = createKit(scene, lot.anim, mats);
    buildHome(k, a, lot, style);
    for (const name of style.out) OUTSIDE[name]?.(k, a, lot, style);
    dressLot(k, a, lot, style, mine, style.id === mainId);
    mergeByMaterial(node, lot.holder);
    node.dispose();
  }

  function clearLot(lot) {
    for (const sign of lot.signs) sign.dispose();
    lot.signs = [];
    lot.holder?.dispose();
    lot.anim?.dispose();
    lot.holder = null;
    lot.anim = null;
    lot.animators = [];
  }

  function buildHome(k, a, lot, style) {
    const { w, d, h, setback } = lot;
    const walls = mats.windows(style.id, style.wall, style.trim, style.window);
    k.windowBox(w, h, d, 0, h / 2, d / 2, walls, lot.type === "house" ? 2.8 : 3.2);
    if (lot.type === "house" && !style.flat) {
      k.prism(w + 1, d + 1.2, 3.4, h, d / 2, style.roof);
      k.box(1.2, 2.6, 1.2, w * 0.28, h + 2.2, d * 0.65, style.trim);
    } else {
      k.box(w + 0.6, 0.5, d + 0.6, 0, h + 0.25, d / 2, style.roof);
    }
    const sign = (text, sw, sh, background, ink) => {
      const plate = createSign(scene, lot.anim, text, sw, sh, background, ink, 0.3);
      lot.signs.push(plate);
      return plate;
    };
    lot.animators.push(buildFrontDoor(scene, k, a, lot, style, { mats, low: quality() === "low", sign }));
    k.box(2, 0.03, setback - 0.4, 0, 0.075, -setback / 2, "#d9d4cc");
    if (lot.type === "apartment" || lot.type === "hotel") {
      const wide = lot.type === "hotel" ? 9 : 5;
      k.box(wide, 0.25, 2.6, 0, 3.3, -1.3, style.trim);
      for (const side of [-1, 1]) k.cyl(0.18, 0.18, 3.2, side * (wide / 2 - 0.3), 1.6, -2.4, style.trim);
    }
    if (lot.type === "penthouse") {
      k.box(w + 0.4, 5, d + 0.4, 0, h - 2.5, d / 2, style.window, { alpha: 0.6, glow: 0.35 });
      k.cyl(11, 11, 0.2, 0, h + 0.6, d / 2, "#3a4252", { tess: 24 });
      k.ring(9.6, 0.25, 0, h + 0.72, d / 2, "#ffd23f", { glow: 0.5 });
      for (const x of [-1.4, 1.4]) k.box(0.6, 0.05, 4, x, h + 0.73, d / 2, "#ffffff");
      k.box(2.2, 0.05, 0.6, 0, h + 0.73, d / 2, "#ffffff");
    }
    if (lot.type === "mansion") {
      for (const side of [-1, 1]) {
        k.windowBox(8, h * 0.7, d * 0.8, side * (w / 2 + 4), (h * 0.7) / 2, d * 0.45, walls);
        k.box(8.6, 0.4, d * 0.8 + 0.6, side * (w / 2 + 4), h * 0.7 + 0.2, d * 0.45, style.roof);
      }
      k.box(12, 0.4, 4, 0, 5, -2, style.trim);
      for (const x of [-5.4, -1.8, 1.8, 5.4]) k.cyl(0.6, 0.7, 5, x, 2.5, -3.6, "#ffffff");
      for (const side of [-1, 1]) {
        k.box(18, 1.2, 1, side * 15, 0.6, -setback + 1.2, "#3f7a3a");
      }
    }
    if (lot.type === "house") {
      k.box(3.2, 0.35, 2.2, 0, 0.17, -1.1, "#c9c2b6");
      k.box(4, 0.2, 2.4, 0, 2.95, -1.2, style.roof);
    }
  }

  function dressLot(k, a, lot, style, mine, isMain) {
    const { w, h, setback } = lot;
    const name = createSign(scene, lot.anim, t(style.nameKey), lot.type === "house" ? 3.6 : 7, lot.type === "house" ? 0.8 : 1.4, "#fff6ea", "#4d315f");
    if (lot.type === "house") {
      name.place(-2.4, 1.3, -setback + 1.5);
      k.box(0.12, 1.8, 0.12, -4.1, 0.9, -setback + 1.55, "#7a4e2d");
      k.box(0.12, 1.8, 0.12, -0.7, 0.9, -setback + 1.55, "#7a4e2d");
    } else {
      name.place(0, lot.type === "hotel" ? 4.4 : lot.type === "mansion" ? 6 : 4.2, lot.type === "mansion" ? -4.05 : -0.6);
    }
    lot.signs.push(name);
    if (!mine) {
      const sale = createSign(
        scene,
        lot.anim,
        t("city.forSale").replace("{n}", style.price.toLocaleString("en-US")),
        4.2,
        1.1,
        "#ffffff",
        "#e23b4a",
      );
      const x = Math.min(w / 2 + 3, BLOCK_HALF - 4);
      sale.place(x, 1.9, -setback + 1.2);
      k.box(0.14, 2.4, 0.14, x - 1.8, 1.2, -setback + 1.25, "#ffffff");
      k.box(0.14, 2.4, 0.14, x + 1.8, 1.2, -setback + 1.25, "#ffffff");
      lot.signs.push(sale);
    } else {
      const tag = createSign(scene, lot.anim, isMain ? t("city.homeSign") : t("city.ownedSign"), 3.2, 1, isMain ? "#ff6fa5" : "#3ecf8e", "#ffffff");
      const y = Math.min(h, 9) + 3.2;
      tag.place(0, y, -2.4);
      lot.signs.push(tag);
      if (isMain) {
        const icon = new TransformNode("city-home-icon", scene);
        icon.parent = lot.anim;
        icon.position.set(0, y + 1.9, -2.4);
        const ik = createKit(scene, icon, mats);
        ik.box(1.3, 1, 1.3, 0, 0, 0, "#ff6fa5", { glow: 0.6 });
        ik.cyl(0, 2.1, 1, 0, 1, 0, "#ffd23f", { tess: 4, glow: 0.6 });
        lot.animators.push((time) => {
          icon.rotation.y = time * 1.2;
          icon.position.y = y + 1.9 + Math.sin(time * 2) * 0.2;
        });
      }
    }
  }

  function addLotColliders(lot) {
    const c = lotPoint(lot, 0, lot.d / 2);
    solid(lot.w, lot.h, lot.d, c.x, lot.h / 2, c.z);
    if (lot.type === "mansion") {
      for (const side of [-1, 1]) {
        const wing = lotPoint(lot, side * (lot.w / 2 + 4), lot.d * 0.45);
        solid(8, lot.h * 0.7, lot.d * 0.8, wing.x, (lot.h * 0.7) / 2, wing.z);
      }
    }
    if (lot.type === "penthouse") {
      solid(lot.w + 0.4, 5, lot.d + 0.4, c.x, lot.h - 2.5, c.z);
    }
  }

  /** A static box people bump into, in city coordinates. Cars bump into it too. */
  function solid(w, h, d, x, y, z, { camera = true, car: forCar = true } = {}) {
    const mesh = MeshBuilder.CreateBox("city-solid", { width: w, height: h, depth: d }, scene);
    mesh.parent = root;
    mesh.position.set(OX + x, OY + y, OZ + z);
    mesh.isVisible = false;
    mesh.isPickable = false;
    if (camera) mesh.metadata = { blocksCamera: true };
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(w, h, d), scene);
    shape.material = { friction: 0.9, restitution: 0 };
    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
    body.shape = shape;
    body.setMassProperties({ mass: 0 });
    body.disablePreStep = true;
    if (forCar) carSolids.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    return { mesh, body, shape };
  }

  function carOnly(x, z, half) {
    carSolids.push({ x0: x - half, x1: x + half, z0: z - half, z1: z + half });
  }

  function buildStreets() {
    const node = new TransformNode("city-streets", scene);
    node.parent = root;
    node.position.set(OX, OY, OZ);
    const holder = new TransformNode("city-streets-mesh", scene);
    holder.parent = root;
    const k = createKit(scene, node, mats);

    k.box(GROUND_HALF * 2, 1, GROUND_HALF * 2, 0, -0.5, 0, "#86c97a");
    const floor = solid(GROUND_HALF * 2, 1, GROUND_HALF * 2, 0, GROUND - 0.5, 0, { camera: false, car: false });
    floor.mesh.isVisible = false;
    for (const [x, z, w, d] of [[EDGE + 2, 0, 1, EDGE * 2 + 6], [-EDGE - 2, 0, 1, EDGE * 2 + 6], [0, EDGE + 2, EDGE * 2 + 6, 1], [0, -EDGE - 2, EDGE * 2 + 6, 1]]) {
      solid(w, 6, d, x, 3, z, { camera: false, car: false });
      k.box(w, 1.6, d, x, 0.8, z, "#3f8f4e");
    }
    const far = MeshBuilder.CreateGround("city-countryside", { width: 3600, height: 3600 }, scene);
    far.parent = root;
    far.position.set(OX, OY - 0.4, OZ);
    const farMat = new StandardMaterial("city-countryside-mat", scene);
    farMat.diffuseColor = Color3.FromHexString("#7cc06e");
    farMat.specularColor = Color3.Black();
    far.material = farMat;
    far.isPickable = false;

    for (const r of ROADS) {
      k.box(ROAD_END * 2, 0.04, ROAD_W, 0, 0.02, r, "#4a4f5c");
      k.box(ROAD_W, 0.04, ROAD_END * 2, r, 0.021, 0, "#4a4f5c");
      for (let s = -ROAD_END + 2; s < ROAD_END - 2; s += 6) {
        if (ROADS.some((cross) => Math.abs(cross - s) < ROAD_W / 2 + 2)) continue;
        k.box(2.6, 0.02, 0.22, s, 0.045, r, "#fff6d2");
        k.box(0.22, 0.02, 2.6, r, 0.046, s, "#fff6d2");
      }
      for (const cross of ROADS) {
        for (let i = -2; i <= 2; i += 1) {
          k.box(1, 0.02, 3, cross + i * 2, 0.047, r - ROAD_W / 2 - 1.8, "#ffffff");
          k.box(1, 0.02, 3, cross + i * 2, 0.047, r + ROAD_W / 2 + 1.8, "#ffffff");
        }
      }
    }

    const rand = seeded(9127);
    const look = seeded(4411);
    for (const cx of CENTERS) {
      for (const cz of CENTERS) {
        const home = LOTS.some((lot) => lot.cx === cx && lot.cz === cz);
        const park = PARK.cx === cx && PARK.cz === cz;
        const shop = SHOP.cx === cx && SHOP.cz === cz;
        k.box(BLOCK_HALF * 2, 0.06, BLOCK_HALF * 2, cx, 0.03, cz, "#dcd6cc");
        k.box(BLOCK_HALF * 2 - 5, 0.02, BLOCK_HALF * 2 - 5, cx, 0.065, cz, home || park ? "#8fd18a" : "#ece5d8");
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const x = cx + sx * (BLOCK_HALF - 1.2);
            const z = cz + sz * (BLOCK_HALF - 1.2);
            const r = look();
            plant(r < 0.38 ? "oak" : r < 0.6 ? "birch" : r < 0.84 ? "palm" : "cherry", x, z, 0.78 + look() * 0.2, look);
            forest.add("pit", x, z, { yaw: Math.floor(look() * 4) * (Math.PI / 2) });
            carOnly(x, z, 0.5);
          }
        }
        if (park) buildPark(k, cx, cz, look);
        else if (shop) buildShop(k, holder);
        else if (!home && !(SPORTS_PARK.cx === cx && SPORTS_PARK.cz === cz)) buildBlock(k, cx, cz, rand);
      }
    }

    for (let s = -176; s <= 176; s += 11) {
      for (const [x, z] of [[s, 172], [s, -172], [172, s], [-172, s]]) {
        const jx = x + (rand() - 0.5) * 4;
        const jz = z + (rand() - 0.5) * 4;
        if (rand() < 0.35) plant("pine", jx, jz, (1.2 + rand() * 0.6) * 0.65, look);
        else {
          const size = 1 + rand() * 0.6;
          rand();
          const r = look();
          plant(r < 0.55 ? "oak" : r < 0.86 ? "birch" : "cherry", jx, jz, size * (r < 0.55 ? 0.8 : 0.85), look);
        }
        carOnly(jx, jz, 0.6);
        if (look() < 0.5) forest.add("bush", jx + (look() - 0.5) * 6, jz + (look() - 0.5) * 6, { size: 0.8 + look() * 0.6, yaw: look() * 6.3, tint: leafTint(look) });
      }
    }

    // The cherry blossom avenue: both sides of the street by the park, trunk to trunk.
    for (let z = AVENUE.z0; z <= AVENUE.z1; z += AVENUE.step) {
      for (const side of [-1, 1]) {
        const x = AVENUE.x + side * AVENUE.side;
        plant("cherry", x, z, 0.85 + look() * 0.18, look);
        carOnly(x, z, 0.5);
      }
    }

    // Palm-lined streets in the sunny quarter by the beach house and the beach villa. Gaps are
    // left at crossings, corner trees, and every lot's driveway.
    const palmLook = seeded(7310);
    for (const row of PALM_ROWS) {
      for (let s = row.from; s <= row.to; s += row.step) {
        if (ROADS.some((road) => Math.abs(s - road) < 12.5)) continue;
        if (CENTERS.some((c) => Math.abs(s - (c - BLOCK_HALF + 1.2)) < 3.5 || Math.abs(s - (c + BLOCK_HALF - 1.2)) < 3.5)) continue;
        for (const side of [-1, 1]) {
          const x = row.x !== undefined ? row.x + side * row.side : s;
          const z = row.x !== undefined ? s : row.z + side * row.side;
          if (LOTS.some((lot) => Math.hypot(parkingOf(lot).x - x, parkingOf(lot).z - z) < 7)) continue;
          palm(x, z, palmLook);
        }
      }
    }

    mergeByMaterial(node, holder);
    node.dispose();
    streetMeshes.push(...holder.getChildMeshes(false));
  }

  /** A street tree with its own size, turn, and a slight shift in color. */
  function plant(species, x, z, size, look) {
    const tint = species === "cherry" ? [1, 0.93 + look() * 0.1, 0.94 + look() * 0.1] : leafTint(look);
    forest.add(species, x, z, { size, yaw: look() * Math.PI * 2, tint, variant: Math.floor(look() * 3) });
  }

  /** A palm, any of its four shapes, a little taller or shorter than the next. */
  function palm(x, z, look, size = 0.86) {
    forest.add("palm", x, z, { size: size * (0.88 + look() * 0.3), yaw: look() * Math.PI * 2, tint: leafTint(look), variant: Math.floor(look() * 4) });
    carOnly(x, z, 0.45);
  }

  function leafTint(look) {
    const k = 0.9 + look() * 0.18;
    return [k * (0.94 + look() * 0.1), k, k * (0.92 + look() * 0.1)];
  }

  function buildBlock(k, cx, cz, rand) {
    const fz = cz > 0 ? -1 : 1;
    const front = cz + fz * (BLOCK_HALF - 4);
    let x = cx - 26;
    while (cx + 26 - x > 7) {
      const bw = Math.min(cx + 26 - x, 9 + rand() * 11);
      const bd = 14 + rand() * 30;
      const bh = 9 + Math.floor(rand() * 10) * 3.6;
      const bx = x + bw / 2;
      const bz = front - (fz * bd) / 2;
      const palette = GENERIC[Math.floor(rand() * GENERIC.length)];
      k.windowBox(bw, bh, bd, bx, bh / 2, bz, mats.windows(palette.id, palette.wall, palette.trim, palette.glass));
      k.box(bw + 0.4, 0.5, bd + 0.4, bx, bh + 0.25, bz, palette.trim);
      k.box(1.6, 2.4, 0.1, bx, 1.2, front + fz * 0.06, "#5a3b2a");
      k.box(2.4, 0.15, 1.4, bx, 2.7, front + fz * 0.7, palette.trim);
      solid(bw, bh, bd, bx, bh / 2, bz);
      targets.push({ x: bx, z: front + fz * 2.2, fz, door: front });
      x += bw + 1.2 + rand() * 2.5;
    }
  }

  function buildPark(k, cx, cz, look) {
    k.cyl(18, 18, 0.06, cx + 4, 0.08, cz + 2, "#3ec6ff", { glow: 0.25, tess: 32 });
    k.cyl(19.5, 19.5, 0.05, cx + 4, 0.075, cz + 2, "#d9d4cc", { tess: 32 });
    k.box(3, 0.03, BLOCK_HALF * 2 - 6, cx - 14, 0.08, cz, "#e9d9b4");
    k.box(BLOCK_HALF * 2 - 6, 0.03, 3, cx, 0.08, cz - 16, "#e9d9b4");
    const kinds = ["oak", "birch", "oak", "cherry", "oak", "birch", "pine"];
    [[-22, -22, 1.3], [-22, 6, 1.1], [-6, 20, 1.4], [18, 22, 1.2], [22, -20, 1.3], [-4, -24, 1], [22, 2, 1]].forEach(([x, z, size], index) => {
      const species = kinds[index];
      plant(species, cx + x, cz + z, size * (species === "pine" ? 0.65 : 0.8), look);
      carOnly(cx + x, cz + z, 0.6);
    });
    // Cherry blossoms along the path and by the pond, with shrubs round the water.
    for (const [x, z] of [[-17.6, -7], [-17.6, 3.5], [-17.6, 13], [-10.4, -3], [-10.4, 7], [13, -11], [6, 15.5]]) {
      plant("cherry", cx + x, cz + z, 0.85 + look() * 0.2, look);
      carOnly(cx + x, cz + z, 0.5);
    }
    for (const [x, z] of [[16.5, -5], [-2, -12.5], [16, 12]]) palm(cx + x, cz + z, look, 0.8);
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      forest.add("bush", cx + 4 + Math.cos(a) * 11.4, cz + 2 + Math.sin(a) * 11.4, { size: 0.7 + look() * 0.5, yaw: look() * 6.3, tint: leafTint(look) });
    }
    for (const [x, z] of [[-10, -14], [6, -14], [-10, 14]]) {
      k.box(2.4, 0.12, 0.7, cx + x, 0.55, cz + z, "#a0673f");
      k.box(2.4, 0.6, 0.12, cx + x, 0.9, cz + z + 0.32, "#a0673f");
      for (const side of [-1, 1]) k.box(0.12, 0.5, 0.6, cx + x + side * 1.1, 0.25, cz + z, "#3a4252");
    }
    const colors = ["#ff6fa5", "#ffd23f", "#9b8cff", "#ff8a5a"];
    for (let i = 0; i < 14; i += 1) k.ball(0.5, cx - 24 + i * 1.1, 0.3, cz + 24, colors[i % 4]);
  }

  function buildShop(k, holder) {
    const lot = SHOP;
    const node = new TransformNode("city-pizza", scene);
    node.parent = root;
    node.position.set(OX + lot.cx, OY, OZ + lot.zf);
    node.rotation.y = lot.fz < 0 ? 0 : Math.PI;
    const sk = createKit(scene, node, mats);
    sk.windowBox(lot.w, lot.h, lot.d, 0, lot.h / 2, lot.d / 2, mats.windows("city-pizza", "#fff6ea", "#e23b4a", "#ffe7a8"), 3);
    sk.box(lot.w + 0.6, 0.5, lot.d + 0.6, 0, lot.h + 0.25, lot.d / 2, "#e23b4a");
    for (let x = -lot.w / 2 + 1; x < lot.w / 2; x += 2) {
      sk.box(1, 0.1, 1.6, x, 3.2, -0.7, (x / 2) % 2 ? "#e23b4a" : "#ffffff", { rx: -0.35 });
    }
    sk.box(1.6, 2.4, 0.1, 0, 1.2, -0.06, "#7a4e2d");
    sk.cyl(8, 8, 0.6, 0, lot.h + 3.5, lot.d * 0.4, "#f0b429", { rx: -1.1, tess: 28 });
    sk.cyl(7, 7, 0.62, 0, lot.h + 3.5, lot.d * 0.4, "#e2563b", { rx: -1.1, tess: 28 });
    for (const [x, y] of [[-1.8, 0.8], [1.5, 1.4], [0.2, -0.6], [-0.6, 2.2], [2, -0.8], [-2.2, -1]]) {
      sk.cyl(1, 1, 0.66, x, lot.h + 3.5 + y * 0.45, lot.d * 0.4 - y * 0.9, "#b8382f", { rx: -1.1 });
    }
    sk.box(0.4, 3.4, 0.4, 0, lot.h + 1.6, lot.d * 0.55, "#7a4e2d");
    const sign = createSign(scene, root, t("city.pizzaSign"), 6, 1.3, "#e23b4a", "#ffffff", 0.8);
    const at = lotPoint(lot, 0, -0.4);
    sign.place(OX + at.x, OY + 4.2, OZ + at.z, lot.fz < 0 ? 0 : Math.PI);
    const c = lotPoint(lot, 0, lot.d / 2);
    solid(lot.w, lot.h, lot.d, c.x, lot.h / 2, c.z);
    mergeByMaterial(node, holder);
    node.dispose();
  }

  function buildTraffic() {
    const cars = [];
    LOOPS.forEach((loop, loopIndex) => {
      const path = lanePath(loop.corners);
      for (let i = 0; i < loop.cars; i += 1) {
        const index = cars.length;
        const paint = TRAFFIC_PAINT[(index * 3) % TRAFFIC_PAINT.length];
        const type = TRAFFIC_TYPES[index % TRAFFIC_TYPES.length];
        const model = buildCar(scene, mats, `city-traffic-${loopIndex}-${i}`, { paint, trim: "#3a4252", seat: "#fff6ea", type });
        model.root.parent = root;
        for (const mesh of model.parts) graphics?.shadow?.addShadowCaster(mesh, false);
        const driver = people.add(700 + index * 31, { mode: "seated", car: model.body, seat: driverSeat(type) });
        cars.push({ path, model, driver, s: (path.total * i) / loop.cars, speed: 0, cruise: loop.speed, x: 0, z: 0, heading: 0, steer: 0, blocked: 0 });
      }
    });
    for (const bot of cars) placeTraffic(bot, 0);
    return cars;
  }

  function placeTraffic(bot, dt) {
    const at = pointOn(bot.path, bot.s);
    const back = pointOn(bot.path, bot.s - 2.5);
    const ahead = pointOn(bot.path, bot.s + 2.5);
    const turn = pointOn(bot.path, bot.s + 3.8);
    bot.x = at.x;
    bot.z = at.z;
    bot.heading = Math.atan2(ahead.x - back.x, ahead.z - back.z);
    const toward = Math.atan2(turn.x - at.x, turn.z - at.z);
    const steer = Math.max(-0.5, Math.min(0.5, angleDiff(toward, bot.heading) * 2.2));
    bot.steer += (steer - bot.steer) * Math.min(1, dt * 8);
    bot.model.root.position.set(OX + bot.x, OY + 0.03, OZ + bot.z);
    bot.model.root.rotation.y = bot.heading;
    for (const wheel of bot.model.wheels) {
      wheel.spin.rotation.x += (bot.speed * dt) / (bot.model.wheelR ?? WHEEL_R);
      if (wheel.front) wheel.pivot.rotation.y = bot.steer;
    }
  }

  /** People strolling round the blocks, both ways, keeping clear of the mansion's hedges. */
  function buildWalkers() {
    const mansion = lotOf("mansion");
    const blocks = [];
    for (const cx of CENTERS) for (const cz of CENTERS) if (cx !== mansion.cx || cz !== mansion.cz) blocks.push({ cx, cz });
    const r = seeded(2207);
    const list = [];
    for (let i = 0; i < DETAIL.high.walkers; i += 1) {
      const block = blocks[(i * 7) % blocks.length];
      const dir = r() < 0.5 ? 1 : -1;
      const person = people.add(1000 + i * 17, { mode: "walk", speed: 1.05 + r() * 0.45 });
      const ring = WALK + dir * 0.18;
      const walker = { person, block, dir, ring, s: r() * ring * 8, pace: person.speed, heading: 0 };
      walkTo(walker);
      person.yaw = walker.heading;
      list.push(walker);
    }
    return list;
  }

  function walkTo(walker) {
    const { cx, cz } = walker.block;
    const R = walker.ring;
    const per = R * 8;
    const s = ((walker.s % per) + per) % per;
    const side = Math.floor(s / (R * 2));
    const t = s - side * R * 2 - R;
    const p = walker.person;
    if (side === 0) [p.x, p.z, walker.heading] = [cx + t, cz - R, Math.PI / 2];
    else if (side === 1) [p.x, p.z, walker.heading] = [cx + R, cz + t, 0];
    else if (side === 2) [p.x, p.z, walker.heading] = [cx - t, cz + R, -Math.PI / 2];
    else [p.x, p.z, walker.heading] = [cx - R, cz - t, Math.PI];
    if (walker.dir < 0) walker.heading += Math.PI;
  }

  function walk(dt, me, count) {
    walkers.forEach((walker, index) => {
      const p = walker.person;
      p.visible = index < count;
      if (!p.visible) return;
      const sin = Math.sin(walker.heading);
      const cos = Math.cos(walker.heading);
      const ahead = (x, z, reach, width) => {
        const dx = x - p.x;
        const dz = z - p.z;
        const along = dx * sin + dz * cos;
        return along > 0 && along < reach && Math.abs(dx * cos - dz * sin) < width;
      };
      let target = walker.pace;
      if ((me && ahead(me.x, me.z, 1.6, 0.7)) || ahead(car.x, car.z, 2.6, 1.3)) target = 0;
      for (let j = 0; j < count; j += 1) {
        const other = walkers[j];
        if (other === walker || other.block !== walker.block || other.dir !== walker.dir) continue;
        if (ahead(other.person.x, other.person.z, 1.3, 0.5)) target = Math.min(target, other.person.speed * 0.9);
      }
      p.speed += clamp(target - p.speed, -4 * dt, 1.5 * dt);
      walker.s += walker.dir * p.speed * dt;
      walkTo(walker);
      p.yaw += angleDiff(walker.heading, p.yaw) * Math.min(1, dt * 7);
    });
  }

  /** Someone waits at the door for their pizza, and waves once you're close. */
  function serve(me) {
    const spot = job.phase === "deliver" ? job.target : null;
    customer.visible = Boolean(spot?.fz);
    if (!customer.visible) return;
    customer.x = spot.x + 1.3;
    customer.z = spot.door + spot.fz * 0.9;
    customer.yaw = spot.fz > 0 ? 0 : Math.PI;
    customer.mode = me && Math.hypot(me.x - spot.x, me.z - spot.z) < 30 ? "wave" : "idle";
  }

  /** Re-sorts the trees by distance now and then, and poses the people seen from the camera. */
  function showCrowd(dt, time, me) {
    const camera = scene.activeCamera;
    if (!camera) return;
    camera.getDirectionToRef(Axis.Z, lookDir);
    const flat = Math.hypot(lookDir.x, lookDir.z) || 1;
    const view = {
      x: camera.globalPosition.x - OX,
      z: camera.globalPosition.z - OZ,
      fx: lookDir.x / flat,
      fz: lookDir.z / flat,
      far: detail.people,
      ox: OX,
      oy: OY,
      oz: OZ,
    };
    forestWait -= dt;
    const moved = Math.hypot(view.x - lastView.x, view.z - lastView.z) > 3;
    const turned = view.fx * lastView.fx + view.fz * lastView.fz < 0.95;
    if (forestWait <= 0 || moved || turned) {
      forest.update(view);
      Object.assign(lastView, view);
      forestWait = 0.3;
    }
    people.update(dt, time, view);
    forest.drift(dt, time, me ?? view, detail.petals && !room);
  }

  /** Applies the graphics setting: tree and car detail reach, crowd size, petals, and street shadows. */
  function applyDetail() {
    const next = DETAIL[quality() === "low" ? "low" : "high"];
    if (next === detail) return;
    detail = next;
    forest.setReach(detail.near, detail.far);
    setCarDetail(scene, { reflections: detail.carGloss, near: detail.carNear });
    for (const mesh of streetMeshes) mesh.receiveShadows = detail.shadows;
    forestWait = 0;
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function buildMarkers() {
    const node = new TransformNode("city-markers", scene);
    node.parent = root;
    const make = (hex) => {
      const holder = new TransformNode("city-marker", scene);
      holder.parent = node;
      const mk = createKit(scene, holder, mats);
      const ring = mk.ring(8, 0.4, 0, 0.3, 0, hex, { glow: 0.9 });
      mk.cyl(7.6, 7.6, 40, 0, 20, 0, hex, { glow: 0.8, alpha: 0.18, tess: 24 });
      return { holder, ring };
    };
    const shop = make("#ff8a1f");
    const drop = make("#3ecf8e");
    const pickup = lotPoint(SHOP, 0, -5.2);
    shop.holder.position.set(OX + pickup.x, OY, OZ + pickup.z);
    drop.holder.setEnabled(false);
    const arrow = new TransformNode("city-arrow", scene);
    arrow.parent = node;
    const ak = createKit(scene, arrow, mats);
    ak.cyl(1.5, 1.5, 0.2, 0, 0, 0.55, "#ffd23f", { tess: 3, ry: -Math.PI / 2, glow: 0.8 });
    ak.box(0.45, 0.2, 0.9, 0, 0, -0.2, "#ffd23f", { glow: 0.8 });
    arrow.setEnabled(false);
    return { shop, drop, arrow, pickup };
  }

  function parkAtHome() {
    const spot = parkingOf(mainLot());
    placeCar(spot.x, spot.z, spot.heading);
  }

  function loadCar() {
    try {
      return localStorage.getItem(CAR_KEY) ?? CARS[0].id;
    } catch {
      return CARS[0].id;
    }
  }

  /** Swaps in the model for `car.ride`, keeping the car where it is. */
  function buildMyCar() {
    if (car.model) {
      for (const mesh of car.model.parts) graphics?.shadow?.removeShadowCaster(mesh, true);
      car.model.root.dispose();
    }
    car.model = buildCar(scene, mats, "city-car", { paint: car.ride.paint, type: car.ride.type });
    car.model.root.parent = root;
    for (const mesh of car.model.parts) graphics?.shadow?.addShadowCaster(mesh, true);
  }

  /**
   * Makes `id` your car. Driving, you swap cars on the spot. On foot it pulls up beside you,
   * or at home when there's no room (or you're indoors). Returns "same", or "ok".
   */
  function pickCar(id, foot = lastFoot) {
    const next = carDef(id);
    if (next.id === car.ride.id) return "same";
    car.ride = next;
    try {
      localStorage.setItem(CAR_KEY, next.id);
    } catch {
      // Private mode: the pick lasts until you reload.
    }
    buildMyCar();
    if (driving) {
      car.speed = 0;
      syncCar(0);
      return "ok";
    }
    if (!room && foot) {
      const x = foot.x - OX;
      const z = foot.z - OZ;
      const heading = car.heading;
      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      for (const [side, along] of [[2.6, 0], [-2.6, 0], [0, 4], [0, -4], [3.4, 2], [-3.4, 2]]) {
        const cx = x + cos * side + sin * along;
        const cz = z - sin * side + cos * along;
        const { r, half } = carSize();
        const clear = [-1, 1].every((k) => !blocked(cx + sin * k * half, cz + cos * k * half, r));
        if (Math.abs(cx) < EDGE - 3 && Math.abs(cz) < EDGE - 3 && clear) {
          placeCar(cx, cz, heading);
          return "ok";
        }
      }
    }
    parkAtHome();
    return "ok";
  }

  function placeCar(x, z, heading) {
    car.sunk = 0;
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = 0;
    car.steer = 0;
    syncCar(0);
  }

  /** Your car's bump circles: radius and how far each sits ahead and behind the middle. */
  function carSize() {
    return car.ride.size ?? { r: CAR_R, half: CAR_HALF };
  }

  function syncCar(dt) {
    const { root: body, wheels } = car.model;
    body.position.set(OX + car.x, OY + 0.03 + (car.sunk ?? 0), OZ + car.z);
    body.rotation.y = car.heading;
    car.model.body.rotation.z = car.lean;
    car.model.body.rotation.x = car.pitch;
    // Carts bob over the bumps, more the faster they go.
    const bounce = car.ride.drive.bounce ?? 0;
    car.bob = (car.bob ?? 0) + dt * (6 + Math.abs(car.speed) * 1.4);
    const pace = Math.min(1, Math.abs(car.speed) / car.ride.drive.top);
    car.model.body.position.y = bounce ? bounce * pace * (Math.sin(car.bob) * 0.6 + Math.sin(car.bob * 2.3 + 1) * 0.4) : 0;
    const roll = (car.speed * dt) / (car.model.wheelR ?? WHEEL_R);
    for (const wheel of wheels) {
      wheel.spin.rotation.x += roll;
      if (wheel.front) wheel.pivot.rotation.y = car.steer;
    }
    // The bike's cranks turn slower than its wheels; its fork, bars, and basket steer.
    car.crank = (car.crank ?? 0) + roll * 0.42;
    for (const node of car.model.spinners ?? []) node.rotation.x = car.crank;
    for (const node of car.model.steerers ?? []) node.rotation.y = car.steer;
  }

  function seatPose() {
    const sin = Math.sin(car.heading);
    const cos = Math.cos(car.heading);
    const seat = car.model.seat ?? { x: SEAT.x, y: SEAT.y + SEAT_RISE, z: SEAT.z };
    return {
      position: new Vector3(
        OX + car.x + cos * seat.x + sin * seat.z,
        OY + 0.03 + seat.y - SEAT_RISE + FOOT_OFFSET + car.model.body.position.y,
        OZ + car.z - sin * seat.x + cos * seat.z,
      ),
      heading: car.heading,
      sitting: true,
      camera: car.ride.camera,
    };
  }

  /**
   * On the bike, after the avatar has taken its seated pose: legs pedal with the cranks, hands
   * reach for the bars, and the rider leans with the bike. Found by name, so avatar.js stays as is.
   */
  let rider = null;
  scene.onBeforeRenderObservable.add(() => {
    const riding = active && driving && car.ride.pose === "bike";
    if (!riding) {
      if (rider) {
        rider.rig.rotation.z = 0;
        rider.body.rotation.x = 0;
      }
      rider = null;
      return;
    }
    if (!rider) rider = findRider();
    if (!rider) return;
    const a = car.crank ?? 0;
    for (const [index, leg] of rider.legs.entries()) {
      const phase = a + index * Math.PI;
      leg.pivot.rotation.set(-1.05 - 0.38 * Math.sin(phase), 0, (index ? 1 : -1) * 0.06);
      leg.bend.rotation.set(0.95 + 0.45 * Math.cos(phase - 0.6), 0, 0);
    }
    for (const [index, arm] of rider.arms.entries()) arm.rotation.set(-1.15, (index ? -1 : 1) * 0.1, (index ? -1 : 1) * 0.28);
    rider.body.rotation.x = 0.16;
    rider.rig.rotation.z = car.lean;
  });

  /** The player's avatar: the rig whose hips are nearest your seat. */
  function findRider() {
    const seat = seatPose().position;
    let best = null;
    let bestD = 2.5;
    for (const node of scene.transformNodes) {
      if (node.name !== "avatarRig") continue;
      const d = Vector3.Distance(node.getAbsolutePosition(), seat);
      if (d >= bestD) continue;
      const body = node.getChildTransformNodes(true).find((child) => child.name === "avatarBody");
      const kids = body?.getChildTransformNodes(true) ?? [];
      const legs = [-1, 1].map((side) => {
        const pivot = kids.find((child) => child.name === `leg${side}`);
        return pivot && { pivot, bend: pivot.getChildTransformNodes(true).find((child) => child.name === `leg${side}Bend`) };
      });
      const arms = [-1, 1].map((side) => kids.find((child) => child.name === `arm${side}`));
      if (!body || legs.some((leg) => !leg?.bend) || arms.some((arm) => !arm)) continue;
      best = { rig: node, body, legs, arms };
      bestD = d;
    }
    return best;
  }

  function drive(dt, { hold = false, stickX = 0, stickY = 0 } = {}) {
    bumpWait = Math.max(0, bumpWait - dt);
    if (active && trip) return trip.ride?.(dt, { hold, stickX, stickY }) ?? null;
    if (active && room?.inside?.elevator?.riding) return room.inside.elevator.ride();
    if (!active || !driving) return null;
    let throttle = 0;
    let steerIn = 0;
    let handbrake = false;
    if (!hold) {
      if (held.has("up")) throttle += 1;
      if (held.has("down")) throttle -= 1;
      if (held.has("left")) steerIn -= 1;
      if (held.has("right")) steerIn += 1;
      if (Math.abs(stickY) > 0.2) throttle -= stickY;
      if (Math.abs(stickX) > 0.2) steerIn += stickX;
      throttle = clamp(throttle, -1, 1);
      steerIn = clamp(steerIn, -1, 1);
      handbrake = held.has("brake");
    }
    const before = car.speed;
    const tune = car.ride.drive;
    if (throttle > 0) {
      if (car.speed < -0.3) car.speed = Math.min(0, car.speed + BRAKE * dt);
      else car.speed += tune.accel * throttle * dt * (1 - (car.speed / tune.top) * 0.55);
    } else if (throttle < 0) {
      if (car.speed > 0.3) car.speed = Math.max(0, car.speed - BRAKE * dt);
      else car.speed += tune.accel * 0.6 * throttle * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), COAST * dt);
    }
    if (handbrake || hold) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), HANDBRAKE * dt);
    car.speed = clamp(car.speed, -MAX_REV, tune.top);
    const steerTarget = steerIn * tune.steer * (1 - Math.min(0.55, Math.abs(car.speed) / tune.grip));
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    // Pushing on the gas against a wall still turns the nose, so you can steer off it.
    const turnSpeed = throttle !== 0 && Math.abs(car.speed) < 2.5 ? Math.sign(throttle) * 2.5 : car.speed;
    const yawRate = (turnSpeed / WHEELBASE) * Math.tan(car.steer) * (handbrake ? 1.5 : 1);
    car.heading += yawRate * dt;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    collideCar();
    const pool = waterAt({ x: OX + car.x, y: OY + GROUND + 0.1, z: OZ + car.z });
    if (pool && pool.depth >= 1) {
      // Into deep water: the car settles on the bottom and you swim out of it.
      driving = false;
      car.speed = 0;
      car.steer = 0;
      car.lean = 0;
      car.pitch = 0;
      car.sunk = pool.floorY - OY - 0.03;
      syncCar(0);
      pending.push({ type: "toast", text: t("toast.cityCarSplash"), next: null });
      return null;
    }
    const accel = (car.speed - before) / Math.max(dt, 1e-3);
    const leanMax = tune.leanMax ?? 0.12;
    car.lean += (clamp(-yawRate * car.speed * 0.006 * tune.lean, -leanMax, leanMax) - car.lean) * Math.min(1, dt * 6);
    car.pitch += (clamp(-accel * 0.004, -0.06, 0.06) - car.pitch) * Math.min(1, dt * 6);
    syncCar(dt);
    return seatPose();
  }

  function collideCar() {
    let nx = 0;
    let nz = 0;
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    const { r: R, half: HALF } = carSize();
    for (const offset of [HALF, -HALF]) {
      let cx = car.x + forwardX * offset;
      let cz = car.z + forwardZ * offset;
      for (const b of carSolids) {
        if (cx < b.x0 - R || cx > b.x1 + R || cz < b.z0 - R || cz > b.z1 + R) continue;
        const qx = clamp(cx, b.x0, b.x1);
        const qz = clamp(cz, b.z0, b.z1);
        let dx = cx - qx;
        let dz = cz - qz;
        const dist = Math.hypot(dx, dz);
        if (dist >= R) continue;
        if (dist < 1e-5) {
          const ways = [[b.x0 - R - cx, 0], [b.x1 + R - cx, 0], [0, b.z0 - R - cz], [0, b.z1 + R - cz]];
          ways.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
          [dx, dz] = ways[0];
        } else {
          const push = R - dist;
          dx = (dx / dist) * push;
          dz = (dz / dist) * push;
        }
        car.x += dx;
        car.z += dz;
        cx += dx;
        cz += dz;
        nx += dx;
        nz += dz;
      }
      for (const bot of traffic) {
        const bfx = Math.sin(bot.heading);
        const bfz = Math.cos(bot.heading);
        for (const other of [CAR_HALF, -CAR_HALF]) {
          const dx = cx - (bot.x + bfx * other);
          const dz = cz - (bot.z + bfz * other);
          const dist = Math.hypot(dx, dz);
          if (dist >= CAR_R + R || dist < 1e-5) continue;
          const push = CAR_R + R - dist;
          const px = (dx / dist) * push;
          const pz = (dz / dist) * push;
          car.x += px;
          car.z += pz;
          cx += px;
          cz += pz;
          nx += px;
          nz += pz;
        }
      }
    }
    if (Math.abs(car.x) > EDGE) {
      nx += Math.sign(car.x) * -1;
      car.x = Math.sign(car.x) * EDGE;
    }
    if (Math.abs(car.z) > EDGE) {
      nz += Math.sign(car.z) * -1;
      car.z = Math.sign(car.z) * EDGE;
    }
    const length = Math.hypot(nx, nz);
    if (length < 1e-6) return;
    const along = ((forwardX * nx + forwardZ * nz) / length) * Math.sign(car.speed || 1);
    if (along >= 0) return;
    const impact = Math.abs(car.speed) * -along;
    car.speed *= 1 - Math.min(1, -along) * 1.2;
    if (impact > 4 && bumpWait <= 0) {
      bumpWait = 0.4;
      pending.push({ type: "bump", strength: Math.min(1, impact / 20) });
    }
  }

  function exitSpot() {
    const sin = Math.sin(car.heading);
    const cos = Math.cos(car.heading);
    const tries = [[-2.2, 0], [2.2, 0], [0, -3.4], [0, 3.4]];
    for (const [side, along] of tries) {
      const x = car.x + cos * side + sin * along;
      const z = car.z - sin * side + cos * along;
      if (Math.abs(x) < EDGE - 0.5 && Math.abs(z) < EDGE - 0.5 && !blocked(x, z, 0.6)) {
        return { position: new Vector3(OX + x, OY + GROUND + FOOT_OFFSET + 0.08, OZ + z), heading: car.heading };
      }
    }
    return { position: new Vector3(OX + car.x, OY + GROUND + FOOT_OFFSET + 1.6, OZ + car.z), heading: car.heading };
  }

  function blocked(x, z, radius) {
    return carSolids.some((b) => x > b.x0 - radius && x < b.x1 + radius && z > b.z0 - radius && z < b.z1 + radius);
  }

  function doorSpot(lot, outward = false) {
    const at = lotPoint(lot, 0, -2);
    const facingHome = lot.fz > 0 ? Math.PI : 0;
    return {
      position: new Vector3(OX + at.x, OY + GROUND + FOOT_OFFSET + 0.08, OZ + at.z),
      heading: outward ? facingHome + Math.PI : facingHome,
    };
  }

  function parkingOf(lot) {
    const at = lotPoint(lot, Math.min(lot.w / 2 + 4, BLOCK_HALF - 4), -(lot.setback - 2.6));
    return { x: at.x, z: at.z, heading: Math.PI / 2 };
  }

  function enterRoom(lot, style) {
    clearRoom();
    const low = quality() === "low";
    let inside;
    try {
      inside = buildInterior(scene, { mats, style, low, origin: new Vector3(ROOM_X, OY, OZ) });
    } catch (error) {
      console.warn("Room builder failed, using the one-room home", error);
      return enterBoxRoom(lot, style);
    }
    room = { lot, style, inside, animators: [], door: inside.door };
    return { position: inside.spawn.position.clone(), heading: inside.spawn.heading };
  }

  /** The old one-box room, kept for styles the room builder can't lay out. */
  function enterBoxRoom(lot, style) {
    clearRoom();
    const R = { ...ROOMS[lot.type], animators: [] };
    const node = new TransformNode("city-room", scene);
    node.position.set(ROOM_X, OY, OZ);
    const anim = new TransformNode("city-room-anim", scene);
    anim.position.copyFrom(node.position);
    const holder = new TransformNode("city-room-mesh", scene);
    const k = createKit(scene, node, mats);
    const a = createKit(scene, anim, mats);
    const { w, d, h } = R;
    k.box(w, 0.1, d, 0, -0.05, 0, style.floor);
    k.box(w, 0.1, d, 0, h + 0.05, 0, "#fffaf2");
    k.box(w, h, 0.2, 0, h / 2, d / 2 + 0.1, style.wall);
    k.box(w, h, 0.2, 0, h / 2, -d / 2 - 0.1, style.wall);
    k.box(0.2, h, d, w / 2 + 0.1, h / 2, 0, style.wall);
    k.box(0.2, h, d, -w / 2 - 0.1, h / 2, 0, style.wall);
    for (const [bw, bd, x, z] of [[w, 0.06, 0, d / 2 - 0.03], [w, 0.06, 0, -d / 2 + 0.03], [0.06, d, w / 2 - 0.03, 0], [0.06, d, -w / 2 + 0.03, 0]]) {
      k.box(bw, 0.16, bd, x, 0.08, z, style.trim);
    }
    k.box(1.7, 2.5, 0.08, 0, 1.25, -d / 2 + 0.04, style.trim);
    k.box(1.4, 2.3, 0.06, 0, 1.15, -d / 2 + 0.1, "#7a4e2d");
    k.ball(0.16, 0.5, 1.15, -d / 2 + 0.16, "#ffd23f", { glow: 0.3 });
    furnish(k, R, style);
    const spots = [{ x: w * 0.1, z: d * 0.22 }, { x: w * 0.18, z: -d * 0.08 }, { x: -w * 0.05, z: d * 0.05 }];
    style.in.forEach((name, index) => INSIDE[name]?.(k, a, R, style, spots[index % spots.length]));
    mergeByMaterial(node, holder);
    node.dispose();
    const colliders = [
      solidAt(w + 2, 1, d + 2, 0, -0.5, 0, false),
      solidAt(w + 2, 1, d + 2, 0, h + 0.5, 0, true),
      solidAt(w + 2, h + 2, 1, 0, h / 2, d / 2 + 0.5, true),
      solidAt(w + 2, h + 2, 1, 0, h / 2, -d / 2 - 0.5, true),
      solidAt(1, h + 2, d + 2, w / 2 + 0.5, h / 2, 0, true),
      solidAt(1, h + 2, d + 2, -w / 2 - 0.5, h / 2, 0, true),
    ];
    room = { lot, style, holder, anim, colliders, animators: R.animators, door: { x: ROOM_X, z: OZ - d / 2 + 0.9 } };
    return { position: new Vector3(ROOM_X, OY + FOOT_OFFSET + 0.08, OZ - d / 2 + 1.9), heading: 0 };
  }

  function solidAt(w, h, d, x, y, z, camera) {
    const mesh = MeshBuilder.CreateBox("city-room-solid", { width: w, height: h, depth: d }, scene);
    mesh.position.set(ROOM_X + x, OY + y, OZ + z);
    mesh.isVisible = false;
    mesh.isPickable = false;
    if (camera) mesh.metadata = { blocksCamera: true };
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(w, h, d), scene);
    shape.material = { friction: 0.9, restitution: 0 };
    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
    body.shape = shape;
    body.setMassProperties({ mass: 0 });
    body.disablePreStep = true;
    return { mesh, body, shape };
  }

  function clearRoom() {
    if (!room) return;
    if (room.inside) {
      room.inside.dispose();
      room = null;
      return;
    }
    for (const { mesh, body, shape } of room.colliders) {
      body.dispose();
      shape.dispose();
      mesh.dispose();
    }
    room.holder.dispose();
    room.anim.dispose();
    room = null;
  }

  function update(dt, time, { foot, hold = false } = {}) {
    const events = pending.splice(0, pending.length);
    if (!active) {
      hornQueued = false;
      action = null;
      return events;
    }
    honkWait = Math.max(0, honkWait - dt);
    if (hornQueued) {
      hornQueued = false;
      if (driving && !hold) events.push({ type: car.ride.bell ? "bell" : "horn" });
    }
    const local = { x: foot.x - OX, z: foot.z - OZ };
    if (trip) {
      actionLot = null;
      runAddons(dt, time, { foot, local, me: null, hold, events });
      action = addonAction;
      return events;
    }
    lastFoot = { x: foot.x, z: foot.z };
    const outside = !room;
    const me = driving ? { x: car.x, z: car.z } : outside ? local : null;
    for (const bot of traffic) {
      let stop = false;
      const sin = Math.sin(bot.heading);
      const cos = Math.cos(bot.heading);
      const ahead = (x, z, reach, width) => {
        const dx = x - bot.x;
        const dz = z - bot.z;
        const along = dx * sin + dz * cos;
        return along > 0.5 && along < reach && Math.abs(dx * cos - dz * sin) < width;
      };
      const byPlayer = ahead(car.x, car.z, 9, 2.3) || (me && !driving && ahead(me.x, me.z, 8, 2));
      if (byPlayer) stop = true;
      for (const other of traffic) if (other !== bot && ahead(other.x, other.z, 8, 1.6)) stop = true;
      bot.blocked = byPlayer ? bot.blocked + dt : 0;
      if (bot.blocked > 2.5 && honkWait <= 0 && driving) {
        honkWait = 3;
        events.push({ type: "honk" });
      }
      const target = stop ? 0 : bot.cruise;
      bot.speed += clamp(target - bot.speed, -14 * dt, 4 * dt);
      bot.s += bot.speed * dt;
      placeTraffic(bot, dt);
      bot.model.root.computeWorldMatrix(true);
      bot.model.body.computeWorldMatrix(true);
    }
    // A car left in the water gets towed home once you're well away from it.
    if (!driving && car.sunk && (!me || Math.hypot(me.x - car.x, me.z - car.z) > 30)) parkAtHome();
    if (!driving) syncCar(0);
    applyDetail();
    walk(dt, me, detail.walkers);

    job.cooldown = Math.max(0, job.cooldown - dt);
    const pickup = markers.pickup;
    if (me && job.phase === "idle" && job.cooldown <= 0 && Math.hypot(me.x - pickup.x, me.z - pickup.z) < 4.5) {
      const far = targets.filter((spot) => Math.hypot(spot.x - pickup.x, spot.z - pickup.z) > 90);
      job.target = far[Math.floor(Math.random() * far.length)] ?? targets[0];
      job.phase = "deliver";
      job.elapsed = 0;
      events.push({ type: "toast", text: t("toast.cityPizzaGo"), next: driving ? null : t("toast.cityPizzaCar") });
    } else if (job.phase === "deliver") {
      job.elapsed += dt;
      if (me && Math.hypot(me.x - job.target.x, me.z - job.target.z) < 5) {
        const late = clamp((job.elapsed - PIZZA_PAR) / PIZZA_PAR, 0, 1);
        const amount = PIZZA_PAY + Math.round(PIZZA_BONUS * (1 - late));
        earnCoins(coins, amount);
        events.push({ type: "paid", amount, position: new Vector3(OX + me.x, OY + 1.5, OZ + me.z) });
        job.phase = "idle";
        job.target = null;
        job.cooldown = 2;
      }
    }
    markers.shop.holder.setEnabled(job.phase === "idle");
    markers.drop.holder.setEnabled(job.phase === "deliver");
    if (job.target) markers.drop.holder.position.set(OX + job.target.x, OY, OZ + job.target.z);
    markers.shop.ring.rotation.y = time;
    markers.drop.ring.rotation.y = -time;
    markers.shop.ring.position.y = 0.3 + Math.sin(time * 3) * 0.15;
    markers.drop.ring.position.y = 0.3 + Math.sin(time * 3) * 0.15;
    runAddons(dt, time, { foot, local, me, hold, events });
    const goal = job.phase === "deliver" ? job.target : addonGoal ?? pickup;
    const away = me ? Math.hypot(goal.x - me.x, goal.z - me.z) : 0;
    markers.arrow.setEnabled(Boolean(me) && away > 9 && !hold);
    if (me) {
      markers.arrow.position.set(OX + me.x, OY + (driving ? 3.2 : 2.9) + Math.sin(time * 3) * 0.08, OZ + me.z);
      markers.arrow.rotation.y = Math.atan2(goal.x - me.x, goal.z - me.z);
    }

    serve(me);
    showCrowd(dt, time, me);

    for (const lot of LOTS) for (const step of lot.animators) step(time, outside ? local : null);
    if (room) for (const step of room.animators) step(time);
    const entered = room?.inside?.update(time, foot);
    if (entered) events.push({ type: "toast", text: `${entered.emoji} ${t(entered.nameKey)}`, time: 1.4, next: null });
    const lift = room?.inside?.elevator ?? null;
    if (lift) events.push(...lift.update(dt, foot));
    roomFoot = room ? { x: foot.x, y: foot.y, z: foot.z } : null;

    action = null;
    actionLot = null;
    if (driving) action = addonAction ?? "carOut";
    else if (room) {
      action = lift?.riding ? null : lift?.action(foot) ?? null;
      for (const door of action || lift?.riding ? [] : room.inside?.exits ?? [room.door]) {
        if (Math.hypot(foot.x - door.x, foot.z - door.z) < 1.7 && (door.y === undefined || Math.abs(foot.y - door.y) < 1.2)) action = "homeExit";
      }
    } else if (addonAction) action = addonAction;
    else if (!car.sunk && Math.hypot(local.x - car.x, local.z - car.z) < 3) action = "carIn";
    else {
      for (const lot of LOTS) {
        const door = lotPoint(lot, 0, -1.4);
        if (Math.hypot(local.x - door.x, local.z - door.z) < 2.2) {
          action = owned.has(lot.style?.id) ? "homeEnter" : "homeTour";
          actionLot = lot;
          break;
        }
      }
    }
    return events;
  }

  /** Runs the add-ons for this frame: their events join `frame.events`, and the first goal and action win. */
  function runAddons(dt, time, frame) {
    addonGoal = null;
    addonAction = null;
    for (const addon of addons) {
      const out = addon.update?.(dt, time, frame);
      if (out?.length) frame.events.push(...out);
      addonGoal ??= addon.goal ?? null;
      addonAction ??= addon.action ?? null;
    }
  }

  function act() {
    if (!active) return null;
    if (addonAction && action === addonAction) {
      const owner = addons.find((addon) => addon.action === action);
      if (owner) return owner.act(action) ?? null;
    }
    if (action === "carIn") {
      driving = true;
      if (car.ride.bell) return { toast: t("toast.cityRide"), next: t("toast.cityRideKeys") };
      return { toast: t("toast.cityDrive"), next: t("toast.cityDriveKeys") };
    }
    if (action === "carOut") {
      driving = false;
      car.speed = 0;
      car.steer = 0;
      car.lean = 0;
      car.pitch = 0;
      syncCar(0);
      return { spot: exitSpot() };
    }
    if ((action === "homeEnter" || action === "homeTour") && actionLot) {
      const style = actionLot.style;
      if (actionLot === touring) touring = null;
      const spot = enterRoom(actionLot, style);
      const mine = owned.has(style.id);
      return {
        spot,
        toast: mine ? t("toast.cityHome").replace("{name}", t(style.nameKey)) : t("toast.cityTour").replace("{name}", t(style.nameKey)),
        next: mine ? null : t("toast.cityTourBuy"),
      };
    }
    if ((action === "elevatorRide" || action === "elevatorCall") && room?.inside?.elevator && roomFoot) {
      const out = room.inside.elevator.press(roomFoot);
      return out ? { toast: out.toast, next: out.next ?? null } : null;
    }
    if (action === "homeExit" && room) {
      const lot = room.lot;
      clearRoom();
      return { spot: doorSpot(lot, true) };
    }
    return null;
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ owned: [...owned.values()], main: mainId }));
    } catch {
      // Private mode: your homes just won't persist.
    }
  }

  function sellValue(id) {
    const entry = owned.get(id);
    if (!entry || id === FREE_HOME) return 0;
    return Date.now() - entry.at < FULL_REFUND_MS ? entry.paid : Math.floor(entry.paid * SELL_SHARE);
  }

  function goTo(lot, arrive) {
    clearRoom();
    driving = false;
    touring = null;
    const park = parkingOf(lot);
    placeCar(park.x, park.z, park.heading);
    return arrive;
  }

  /** What add-ons (cityV2.js) get to work with. City meters (x east, z north) unless it says world. */
  const host = {
    scene,
    graphics,
    coins,
    mats,
    root,
    origin,
    quality,
    at: { x: OX, y: OY, z: OZ },
    ground: GROUND,
    edge: EDGE,
    roads: ROADS,
    roadWidth: ROAD_W,
    roadEnd: ROAD_END,
    blockHalf: BLOCK_HALF,
    /** Your car: x, z, heading, speed, ride (from CARS), and model (its body node seats people). */
    car,
    targets,
    places: { pizza: markers.pickup, park: { x: PARK.cx - 14, z: PARK.cz - Math.sign(PARK.cz) * (BLOCK_HALF - 2) }, sports: { x: SPORTS_PARK.cx, z: SPORTS_PARK.cz } },
    get active() {
      return active;
    },
    get driving() {
      return driving;
    },
    get mainId() {
      return mainId;
    },
    get pizzaPhase() {
      return job.phase;
    },
    /** The home you're standing in, or null. `inside` is the cityRooms interior when it has one. */
    room() {
      if (!room) return null;
      const box = room.inside ? null : { x: ROOM_X, z: OZ, ...ROOMS[room.lot.type] };
      return { key: room.style.id, main: room.style.id === mainId, inside: room.inside ?? null, box, door: room.door };
    },
    /** A home lot's front door, parking spot, and the street in front, for a home style id. */
    lotSpots(id) {
      const lot = lotOf(homeStyle(id)?.type ?? "apartment");
      const door = lotPoint(lot, 0, -2);
      return { door: { ...door, heading: lot.fz > 0 ? Math.PI : 0 }, parking: parkingOf(lot), street: lotPoint(lot, 0, -lot.setback - 4), fz: lot.fz };
    },
    makeKit: (parent) => createKit(scene, parent, mats),
    solid,
    carOnly,
    blocked,
    placeCar,
    /** Gets you out of the car where it stands. Returns where to stand (world). */
    stopDriving() {
      driving = false;
      car.speed = 0;
      car.steer = 0;
      car.lean = 0;
      car.pitch = 0;
      syncCar(0);
      return exitSpot();
    },
    /** Starts or ends a trip: the streets hide while `spec` ({ ride, spawn, fallY, indoors }) runs things. */
    setTrip(spec) {
      if (spec) {
        clearRoom();
        if (driving) host.stopDriving();
        if (job.phase === "deliver") {
          job.phase = "idle";
          job.target = null;
        }
      }
      trip = spec;
      root.setEnabled(active && !spec);
    },
    goHome: () => goTo(mainLot(), doorSpot(mainLot())),
  };

  return {
    get active() {
      return active;
    },
    get driving() {
      return driving;
    },
    get indoors() {
      return Boolean(room) || Boolean(trip?.indoors);
    },
    /** True while you're off on a trip (the airport, a flight, abroad). */
    get away() {
      return Boolean(trip);
    },
    get action() {
      return action;
    },
    get fallY() {
      return trip?.fallY ?? OY - 12;
    },
    /** 0 to 1, how hard the engine is working. 0 when you're not driving. */
    get engine() {
      if (active && trip) return trip.engine ?? 0;
      return active && driving ? Math.min(1, Math.abs(car.speed) / car.ride.drive.top) : 0;
    },
    /** Adds an add-on: `factory(host)` returns { update, goal, action, act, mapPlaces, moved, leave }. */
    use(factory) {
      const addon = factory(host);
      addons.push(addon);
      return addon;
    },
    /** How loud your ride's motor is: 1 for cars, quieter for carts, 0 for the bike. */
    get motor() {
      return car.ride.sound ?? 1;
    },
    /** The cars you can pick, the one you have, and the scene for their preview pictures. */
    cars: CARS,
    get carId() {
      return car.ride.id;
    },
    scene,
    pickCar,
    get mainId() {
      return mainId;
    },
    get job() {
      return { phase: job.phase, seconds: Math.floor(job.elapsed) };
    },
    /**
     * What the City map draws, in city meters (x east, z north): the ground plan as built, the home
     * lots, named places, you, your car, and where to go next. `foot` is the player's world position.
     */
    mapInfo(foot) {
      const mainType = homeStyle(mainId)?.type;
      const ownedTypes = new Set([...owned.keys()].map((id) => homeStyle(id)?.type));
      const lots = LOTS.map((lot) => {
        const style = lot.style ?? shownStyle(lot);
        const center = lotPoint(lot, 0, lot.d / 2);
        return {
          type: lot.type,
          nameKey: HOME_TYPES.find((spec) => spec.id === lot.type)?.nameKey ?? "city.typeApartment",
          x: center.x,
          z: center.z,
          w: lot.type === "mansion" ? lot.w + 16 : lot.w,
          d: lot.d,
          wall: style.wall,
          roof: style.roof,
          main: lot.type === mainType,
          mine: ownedTypes.has(lot.type),
        };
      });
      const shop = lotPoint(SHOP, 0, SHOP.d / 2);
      const places = [
        { id: "pizza", nameKey: "cityMap.pizza", icon: "🍕", color: "#ffd9a8", x: shop.x, z: shop.z },
        { id: "park", nameKey: "cityMap.park", icon: "🌳", color: "#c9f0c4", x: PARK.cx, z: PARK.cz },
        ...addons.flatMap((addon) => addon.mapPlaces?.() ?? []),
      ];
      const door = room ? lotPoint(room.lot, 0, -1.4) : null;
      const you = driving
        ? { x: car.x, z: car.z, heading: car.heading, driving: true }
        : door
          ? { x: door.x, z: door.z, indoors: true }
          : { x: foot.x - OX, z: foot.z - OZ };
      let goal = { kind: "pickup", x: markers.pickup.x, z: markers.pickup.z };
      if (job.phase === "deliver" && job.target) goal = { kind: "deliver", x: job.target.x, z: job.target.z };
      else if (addonGoal) goal = { kind: addonGoal.kind ?? "deliver", x: addonGoal.x, z: addonGoal.z };
      else if (touring) goal = { kind: "tour", ...lotPoint(touring, 0, -1.4) };
      return { shapes: mapLayout, lots, places, you, car: { x: car.x, z: car.z, heading: car.heading }, goal };
    },
    /**
     * For teleporting from the map (cityTeleport.js), in city meters: where you stand at each
     * place's door (facing in) with the building's footprint, the street grid, your car, and traffic.
     */
    teleportInfo() {
      const door = (lot, w) => {
        const at = lotPoint(lot, 0, -2);
        const c = lotPoint(lot, 0, lot.d / 2);
        return { x: at.x, z: at.z, heading: lot.fz > 0 ? Math.PI : 0, area: { x: c.x, z: c.z, w, d: lot.d } };
      };
      const gate = { x: PARK.cx - 14, z: PARK.cz - Math.sign(PARK.cz) * (BLOCK_HALF - 2) };
      const doors = {
        pizza: door(SHOP, SHOP.w),
        park: { ...gate, heading: Math.atan2(PARK.cx - gate.x, PARK.cz - gate.z) },
      };
      for (const lot of LOTS) doors[lot.type] = door(lot, lot.type === "mansion" ? lot.w + 16 : lot.w);
      return {
        doors,
        roads: ROADS,
        roadWidth: ROAD_W,
        roadEnd: ROAD_END,
        car: { x: car.x, z: car.z, heading: car.heading, sunk: Boolean(car.sunk) },
        traffic: traffic.map((bot) => ({ x: bot.x, z: bot.z })),
      };
    },
    /** True where there's no room to stand: walls, trees, past the hedge, the pond, or water. City meters. */
    blockedAt(x, z, radius = 0.6) {
      if (Math.abs(x) > EDGE - radius || Math.abs(z) > EDGE - radius) return true;
      if (Math.hypot(x - (PARK.cx + 4), z - (PARK.cz + 2)) < 9.75 + radius) return true;
      if (Math.hypot(x - car.x, z - car.z) < 2.4 + radius && !driving) return true;
      return blocked(x, z, radius) || Boolean(waterAt({ x: OX + x, y: OY + GROUND + 0.1, z: OZ + z }));
    },
    /**
     * Moves you to x, z (city meters) facing `heading`: in the car if you're driving, else on foot.
     * A pizza you were carrying is dropped. Returns the spot for player.respawn.
     */
    teleport(x, z, heading) {
      clearRoom();
      const dropped = job.phase === "deliver";
      if (dropped) {
        job.phase = "idle";
        job.target = null;
        job.cooldown = 0;
      }
      if (driving) {
        placeCar(x, z, heading);
        car.lean = 0;
        car.pitch = 0;
        syncCar(0);
        return { ...seatPose(), dropped };
      }
      let y = OY + GROUND;
      try {
        const hit = scene.getPhysicsEngine()?.raycast(new Vector3(OX + x, OY + 8, OZ + z), new Vector3(OX + x, OY - 20, OZ + z));
        if (hit?.hasHit) y = Math.max(y, hit.hitPointWorld.y);
      } catch {
        // No physics query: the city floor is flat here anyway.
      }
      return { position: new Vector3(OX + x, y + FOOT_OFFSET + 0.08, OZ + z), heading, dropped };
    },
    owns(id) {
      return owned.has(id);
    },
    styles(type) {
      return HOME_STYLES.filter((style) => style.type === type);
    },
    sellValue,
    drive,
    update,
    act,
    enter() {
      active = true;
      root.setEnabled(true);
      previews.clear();
      refreshLots();
      return goTo(mainLot(), doorSpot(mainLot()));
    },
    leave() {
      for (const addon of addons) addon.leave?.();
      trip = null;
      active = false;
      driving = false;
      action = null;
      clearRoom();
      root.setEnabled(false);
    },
    spawn() {
      if (trip?.spawn) return trip.spawn();
      return goTo(mainLot(), doorSpot(mainLot()));
    },
    goHome() {
      return goTo(mainLot(), doorSpot(mainLot()));
    },
    /** Shows the style on its lot and takes you there to look round. */
    tour(id) {
      const style = homeStyle(id);
      if (!style) return null;
      previews.set(style.type, id);
      refreshLots();
      const lot = lotOf(style.type);
      const spot = goTo(lot, doorSpot(lot));
      touring = lot;
      return spot;
    },
    /** Spends coins. Returns "ok", "owned", "broke", or "bad". */
    buy(id) {
      const style = homeStyle(id);
      if (!style) return "bad";
      if (owned.has(id)) return "owned";
      if (!spendCoins(coins, style.price)) return "broke";
      owned.set(id, { id, at: Date.now(), paid: style.price });
      save();
      refreshLots();
      return "ok";
    },
    /** Makes an owned home the one you live in. Returns "ok", "same", or "locked". */
    moveIn(id) {
      if (!owned.has(id)) return "locked";
      if (mainId === id) return "same";
      const from = mainId;
      mainId = id;
      previews.delete(homeStyle(id).type);
      save();
      refreshLots();
      for (const addon of addons) addon.moved?.(from, id);
      return "ok";
    },
    /** Returns { result: "ok", value, movedOut } or { result: "free" | "missing" }. */
    sell(id) {
      if (id === FREE_HOME) return { result: "free" };
      if (!owned.has(id)) return { result: "missing" };
      const value = sellValue(id);
      owned.delete(id);
      refundCoins(coins, value);
      const movedOut = mainId === id;
      if (movedOut) mainId = FREE_HOME;
      save();
      refreshLots();
      if (movedOut && !driving) parkAtHome();
      return { result: "ok", value, movedOut };
    },
  };
}

/** The Homes sheet and the city buttons along the bottom of the screen. */
export function bindCity(city, { coins, blip, onCoins, onToast, onSpot }) {
  const garage = bindGarage(city, { blip, onToast });
  const hud = document.querySelector("#city-hud");
  const statusEl = document.querySelector("#city-status");
  const homeLine = document.querySelector("#city-home-line");
  const root = document.querySelector("#city-homes");
  const tabs = document.querySelector("#city-home-tabs");
  const list = document.querySelector("#city-home-list");
  const coinsEl = document.querySelector("#city-coins");
  const note = document.querySelector("#city-homes-status");
  let open = false;
  let type = "apartment";
  let armed = null;
  let armTimer = 0;
  let shownStatus = "";
  let shownHome = "";

  const renderTabs = () => {
    tabs.replaceChildren();
    for (const spec of HOME_TYPES) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(spec.id === type));
      button.textContent = `${spec.emoji} ${t(spec.nameKey)}`;
      button.addEventListener("click", () => {
        type = spec.id;
        armed = null;
        render();
      });
      tabs.append(button);
    }
  };

  const render = () => {
    coinsEl.textContent = coins.coins.toLocaleString("en-US");
    renderTabs();
    list.replaceChildren();
    for (const style of city.styles(type)) {
      const mine = city.owns(style.id);
      const isMain = city.mainId === style.id;
      const card = document.createElement("article");
      card.className = "shop-item city-home";
      if (mine) card.classList.add("is-owned");
      if (isMain) card.classList.add("is-worn");
      const swatch = document.createElement("span");
      swatch.className = "city-home-swatch";
      swatch.style.background = `linear-gradient(160deg, ${style.wall} 0 55%, ${style.roof} 55% 72%, ${style.accent} 72%)`;
      swatch.textContent = HOME_TYPES.find((spec) => spec.id === style.type)?.emoji ?? "🏠";
      swatch.setAttribute("aria-hidden", "true");
      const name = document.createElement("strong");
      name.textContent = t(style.nameKey);
      const hint = document.createElement("small");
      hint.textContent = t(style.hintKey);
      const price = document.createElement("span");
      price.className = "reward-badge";
      if (style.price > 0) {
        const glyph = document.createElement("span");
        glyph.className = "coin-glyph";
        glyph.setAttribute("aria-hidden", "true");
        price.append(glyph, document.createTextNode(` ${style.price.toLocaleString("en-US")}`));
      } else price.textContent = t("city.free");
      const state = document.createElement("small");
      state.className = "city-home-state";
      state.textContent = isMain ? t("city.homeMain") : mine ? t("city.homeOwned") : "";
      const actions = document.createElement("div");
      actions.className = "city-home-actions";
      actions.append(button(t("city.tour"), "is-use", () => tour(style)));
      if (!mine) actions.append(button(t("shop.buy"), coins.coins < style.price ? "is-short" : "", () => buy(style)));
      else if (!isMain) actions.append(button(t("city.moveIn"), "is-use", () => moveIn(style)));
      if (mine && style.price > 0) {
        const value = city.sellValue(style.id);
        const sure = armed === style.id;
        actions.append(
          button(
            sure ? t("city.sellSure").replace("{n}", value.toLocaleString("en-US")) : t("city.sell"),
            sure ? "is-short" : "",
            () => sell(style, value),
          ),
        );
      }
      card.append(swatch, name, hint, price, state, actions);
      list.append(card);
    }
  };

  const button = (label, className, onClick) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (className) element.classList.add(className);
    element.addEventListener("click", onClick);
    return element;
  };

  const tour = (style) => {
    const spot = city.tour(style.id);
    if (!spot) return;
    close();
    onSpot?.(spot);
    onToast?.(t("toast.cityTourGo").replace("{name}", t(style.nameKey)), t("toast.cityTourDoor"));
  };

  const buy = (style) => {
    const result = city.buy(style.id);
    if (result === "ok") {
      blip?.("ding");
      onCoins?.();
      note.textContent = t("city.bought").replace("{name}", t(style.nameKey));
    } else if (result === "broke") {
      note.textContent = t("city.broke").replace("{n}", (style.price - coins.coins).toLocaleString("en-US"));
    }
    render();
  };

  const moveIn = (style) => {
    if (city.moveIn(style.id) !== "ok") return;
    blip?.("ding");
    close();
    onSpot?.(city.goHome());
    onToast?.(t("toast.cityMoved").replace("{name}", t(style.nameKey)), null);
  };

  const sell = (style, value) => {
    if (armed !== style.id) {
      armed = style.id;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        armed = null;
        if (open) render();
      }, 3500);
      render();
      return;
    }
    armed = null;
    const out = city.sell(style.id);
    if (out.result !== "ok") return;
    blip?.("thump");
    onCoins?.();
    note.textContent = t(out.movedOut ? "city.soldMoved" : "city.sold")
      .replace("{name}", t(style.nameKey))
      .replace("{n}", out.value.toLocaleString("en-US"));
    render();
  };

  const close = () => {
    open = false;
    root.hidden = true;
    armed = null;
  };

  const show = () => {
    if (!city.active) return;
    open = true;
    root.hidden = false;
    note.textContent = "";
    const main = homeStyle(city.mainId);
    if (main) type = main.type;
    render();
    document.querySelector("#city-homes-close").focus();
  };

  document.querySelector("#city-homes-open").addEventListener("click", (event) => {
    event.currentTarget.blur();
    show();
  });
  document.querySelector("#city-go-home").addEventListener("click", (event) => {
    event.currentTarget.blur();
    if (!city.active) return;
    onSpot?.(city.goHome());
    onToast?.(t("toast.cityGoHome"), null);
  });
  document.querySelector("#city-homes-close").addEventListener("click", close);
  document.querySelector("#city-homes-backdrop").addEventListener("click", close);
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape" || root.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  });

  const extras = [];
  return {
    get open() {
      return open || garage.open || extras.some((sheet) => sheet.open);
    },
    show,
    close,
    /** Another sheet (Family, plane tickets) that pauses walking and driving while it's open. */
    addSheet(sheet) {
      extras.push(sheet);
    },
    /** Shows the bottom buttons and the job line while you're in the city (not while you're away on a trip). */
    tick(showHud) {
      hud.hidden = !showHud || city.away;
      if (!showHud) {
        if (open) close();
        if (garage.open) garage.close();
        for (const sheet of extras) if (sheet.open) sheet.close();
        return;
      }
      if (city.away) {
        if (open) close();
        if (garage.open) garage.close();
        return;
      }
      const job = city.job;
      const status = job.phase === "deliver" ? t("city.jobDeliver").replace("{s}", String(job.seconds)) : t("city.jobIdle");
      if (status !== shownStatus) {
        shownStatus = status;
        statusEl.textContent = status;
      }
      const home = t("city.homeLine").replace("{name}", t(homeStyle(city.mainId)?.nameKey ?? "home.aptStudio"));
      if (home !== shownHome) {
        shownHome = home;
        homeLine.textContent = home;
      }
    },
  };
}

function prepareLot(lot) {
  const fz = lot.cz > 0 ? -1 : 1;
  const zf = lot.cz + fz * BLOCK_HALF - fz * lot.setback;
  return { ...lot, fz, zf, animators: [], shownKey: "", style: null, holder: null, anim: null, signs: [] };
}

/** A point in a lot's frame (x across the front, z back into the building) in city coordinates. */
function lotPoint(lot, lx, lz) {
  return { x: lot.cx - lot.fz * lx, z: lot.zf - lot.fz * lz };
}

/** The right-hand lane round a square of roads, with the corners rounded off. */
function lanePath(corners, offset = 3.4, radius = 6) {
  const points = [];
  const count = corners.length;
  for (let i = 0; i < count; i += 1) {
    const prev = corners[(i - 1 + count) % count];
    const cur = corners[i];
    const next = corners[(i + 1) % count];
    const inDir = unit(cur[0] - prev[0], cur[1] - prev[1]);
    const outDir = unit(next[0] - cur[0], next[1] - cur[1]);
    const px = cur[0] + (inDir.z + outDir.z) * offset;
    const pz = cur[1] + (-inDir.x - outDir.x) * offset;
    const ax = px - inDir.x * radius;
    const az = pz - inDir.z * radius;
    const bx = px + outDir.x * radius;
    const bz = pz + outDir.z * radius;
    for (let step = 0; step <= 6; step += 1) {
      const u = step / 6;
      const v = 1 - u;
      points.push({ x: v * v * ax + 2 * v * u * px + u * u * bx, z: v * v * az + 2 * v * u * pz + u * u * bz });
    }
  }
  const lengths = [0];
  for (let i = 1; i <= points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i % points.length];
    lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { points, lengths, total: lengths[points.length] };
}

function pointOn(path, s) {
  const total = path.total;
  const at = ((s % total) + total) % total;
  let i = 1;
  while (i < path.lengths.length - 1 && path.lengths[i] < at) i += 1;
  const a = path.points[i - 1];
  const b = path.points[i % path.points.length];
  const span = path.lengths[i] - path.lengths[i - 1] || 1;
  const u = (at - path.lengths[i - 1]) / span;
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}

function unit(x, z) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSave() {
  const fallback = { owned: [{ id: FREE_HOME, at: 0, paid: 0 }], main: FREE_HOME };
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    const seen = new Set();
    const owned = (Array.isArray(data?.owned) ? data.owned : [])
      .filter((entry) => homeStyle(entry?.id) && !seen.has(entry.id) && seen.add(entry.id))
      .map((entry) => ({
        id: entry.id,
        at: Number.isFinite(entry.at) ? entry.at : 0,
        paid: Number.isFinite(entry.paid) && entry.paid > 0 ? Math.floor(entry.paid) : 0,
      }));
    if (!owned.some((entry) => entry.id === FREE_HOME)) owned.unshift({ id: FREE_HOME, at: 0, paid: 0 });
    const main = owned.some((entry) => entry.id === data?.main) ? data.main : FREE_HOME;
    return { owned, main };
  } catch {
    return fallback;
  }
}
