import {
  Color3,
  Color4,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { plainMaterial, unlitMaterial } from "./seasons.js";
import { isCoasterSky } from "./coasterSky.js";
import { spendCoins } from "./coins.js";
import { t } from "./i18n.js";

/** The deck's front edge stays put (the catwalk leaves from it), so bigger decks grow sideways and back. */
export const DECK_FRONT = 17;

export const DECK_TIERS = [
  { half: 23, back: -17, cost: 0, nameKey: "upgrade.deckCozy", emoji: "🏡" },
  { half: 29, back: -25, cost: 2500, nameKey: "upgrade.deckRoomy", emoji: "🏠" },
  { half: 35, back: -33, cost: 6000, nameKey: "upgrade.deckHuge", emoji: "🏰" },
  { half: 42, back: -43, cost: 12000, nameKey: "upgrade.deckMega", emoji: "🌟" },
];

export const CARTS = [
  { id: "classic", cost: 0, nameKey: "upgrade.cartClassic", emoji: "🎀", swatch: "linear-gradient(135deg, #ff4d8d 0 50%, #fff6ea 50%)" },
  { id: "lollipop", cost: 2500, nameKey: "upgrade.cartLollipop", emoji: "🍭", swatch: "repeating-linear-gradient(45deg, #ff4d8d 0 8px, #fff6ea 8px 16px)" },
  { id: "rainbow", cost: 4000, nameKey: "upgrade.cartRainbow", emoji: "🌈", swatch: "linear-gradient(180deg, #ff5d73, #ff9f45, #ffd23f, #7dcea0, #5bb8ff, #a98bff)" },
  { id: "gold", cost: 6000, nameKey: "upgrade.cartGold", emoji: "👑", swatch: "radial-gradient(circle at 35% 30%, #fff3b0, #ffc93c 55%, #d99a1c)" },
  { id: "rocket", cost: 8000, nameKey: "upgrade.cartRocket", emoji: "🚀", swatch: "linear-gradient(135deg, #fffafc 0 55%, #ff9a3d 55%)" },
];

export const DECOR = [
  { id: "lights", cost: 300, nameKey: "upgrade.decorLights", hintKey: "upgrade.decorLightsHint", emoji: "💡" },
  { id: "flag", cost: 200, nameKey: "upgrade.decorFlag", hintKey: "upgrade.decorFlagHint", emoji: "🚩" },
  { id: "balloons", cost: 250, nameKey: "upgrade.decorBalloons", hintKey: "upgrade.decorBalloonsHint", emoji: "🎈" },
  { id: "arch", cost: 600, nameKey: "upgrade.decorArch", hintKey: "upgrade.decorArchHint", emoji: "🍬" },
  { id: "fireworks", cost: 1000, nameKey: "upgrade.decorFireworks", hintKey: "upgrade.decorFireworksHint", emoji: "🎆" },
];

/** Mirrors the parts shack across the deck, open to the front (+z) like it. */
export const DECOR_SHACK = { x: 15, z: -5.5 };
/** Where you stand to shop: the ring in front of the shack's counter. */
export const DECOR_SPOT = { x: DECOR_SHACK.x, z: DECOR_SHACK.z + 3.3, reach: 2.6 };

const MAX_PLACED = 60;
const MAX_STOCK = 99;
/** Decor beside the track sits on the side away from the catwalk, clear of the car. */
const TRACK_SIDE = 0.95;
const TAP_PX = 6;
const TAP_MS = 450;
const TINTS = ["#ff4d8d", "#7dcea0", "#ffd23f", "#b79cff"];
const BULBS = ["#ff7eb0", "#ffd23f", "#8de0b4", "#fff6ea"];
const PALETTES = [
  [new Color4(1, 0.42, 0.66, 1), new Color4(1, 0.86, 0.93, 1)],
  [new Color4(1, 0.84, 0.25, 1), new Color4(1, 0.97, 0.72, 1)],
  [new Color4(0.45, 0.9, 0.68, 1), new Color4(0.86, 1, 0.94, 1)],
  [new Color4(0.72, 0.6, 1, 1), new Color4(0.95, 0.9, 1, 1)],
];

/** Upgrades kept in the coaster save. Missing or broken fields fall back to the starter yard. */
export function cleanUpgrades(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const deck = Number.isInteger(data.deck) ? Math.max(0, Math.min(DECK_TIERS.length - 1, data.deck)) : 0;
  const known = new Set(CARTS.map((cart) => cart.id));
  const listed = Array.isArray(data.carts) ? data.carts : [];
  const carts = ["classic", ...listed].filter((id, i, all) => known.has(id) && all.indexOf(id) === i);
  const cart = carts.includes(data.cart) ? data.cart : "classic";
  const decor = {};
  for (const item of DECOR) {
    const n = Math.floor(Number(data.decor?.[item.id]));
    decor[item.id] = Number.isFinite(n) && n > 0 ? Math.min(MAX_STOCK, n) : 0;
  }
  const types = new Set(DECOR.map((item) => item.id));
  const placed = (Array.isArray(data.placed) ? data.placed : [])
    .filter((p) => p && types.has(p.type) && [p.x, p.y, p.z, p.yaw].every(Number.isFinite))
    .slice(0, MAX_PLACED)
    .map((p) => ({ type: p.type, x: p.x, y: p.y, z: p.z, yaw: p.yaw, track: p.track === true, tint: (Math.floor(p.tint) || 0) % TINTS.length }));
  return { deck, carts, cart, decor, placed, sky: isCoasterSky(data.sky) ? data.sky : "space" };
}

export function deckTier(level) {
  return DECK_TIERS[Math.max(0, Math.min(DECK_TIERS.length - 1, level))];
}

const paints = new WeakMap();
function paint(scene, hex, glow = 0.14) {
  let cache = paints.get(scene);
  if (!cache) {
    cache = new Map();
    paints.set(scene, cache);
  }
  const key = `${hex}/${glow}`;
  if (!cache.has(key)) cache.set(key, plainMaterial(scene, `coaster-up-${key}`, hex, glow));
  return cache.get(key);
}

function shiny(scene) {
  const material = paint(scene, "#ffc93c", 0.18);
  material.specularColor = new Color3(0.85, 0.7, 0.32);
  material.specularPower = 24;
  return material;
}

function piece(root, mesh, material, x, y, z) {
  mesh.material = material;
  mesh.parent = root;
  mesh.position.set(x, y, z);
  mesh.isPickable = false;
  return mesh;
}

/**
 * Swaps the car's look. Every style keeps the classic floor height, so the rider sits the same.
 * Returns `tick(time)` for anything that moves.
 */
export function dressCart(scene, root, id, mats) {
  for (const child of root.getChildren()) child.dispose(false, false);
  const box = (w, h, d) => MeshBuilder.CreateBox("coaster-cart-part", { width: w, height: h, depth: d }, scene);
  const ball = (d) => MeshBuilder.CreateSphere("coaster-cart-part", { diameter: d, segments: 10 }, scene);
  const cyl = (h, d, top = d) =>
    MeshBuilder.CreateCylinder("coaster-cart-part", { height: h, diameterBottom: d, diameterTop: top, tessellation: 14 }, scene);
  const wheels = () => {
    for (const [x, z] of [[-0.5, 0.55], [0.5, 0.55], [-0.5, -0.55], [0.5, -0.55]]) {
      piece(root, cyl(0.14, 0.34), mats.ink, x, 0.18, z).rotation.z = Math.PI / 2;
    }
  };
  let tick = () => {};

  if (id === "lollipop") {
    piece(root, box(1.2, 0.14, 1.75), paint(scene, "#7dcea0", 0.14), 0, 0.32, 0);
    for (const x of [-0.58, 0.58]) {
      [-0.6, -0.2, 0.2, 0.6].forEach((z, i) => piece(root, box(0.1, 0.48, 0.4), i % 2 ? mats.cream : mats.pink, x, 0.58, z));
      [-0.5, 0, 0.5].forEach((z, i) => {
        const drop = piece(root, ball(0.2), paint(scene, TINTS[(i + 2) % 4], 0.16), x, 0.86, z);
        drop.scaling.y = 0.8;
      });
    }
    piece(root, box(1.16, 0.72, 0.1), mats.cream, 0, 0.7, -0.8);
    piece(root, cyl(1, 0.07), mats.cream, 0, 1.2, -0.86);
    for (const [d, h, material] of [[0.86, 0.08, mats.pink], [0.6, 0.1, mats.cream], [0.34, 0.12, mats.pink]]) {
      piece(root, cyl(h, d), material, 0, 1.9, -0.86).rotation.x = Math.PI / 2;
    }
    piece(root, ball(0.3), mats.pink, 0, 0.62, 0.95);
  } else if (id === "rainbow") {
    const white = mats.white;
    piece(root, box(1.2, 0.14, 1.75), white, 0, 0.32, 0);
    const bands = ["#ff5d73", "#ff9f45", "#ffd23f", "#7dcea0", "#5bb8ff", "#a98bff"];
    for (const x of [-0.58, 0.58]) {
      bands.forEach((hex, i) => piece(root, box(0.1, 0.08, 1.6), paint(scene, hex, 0.16), x, 0.78 - i * 0.08, 0));
    }
    piece(root, box(1.16, 0.6, 0.1), white, 0, 0.66, -0.8);
    bands.slice(0, 5).forEach((hex, i) => {
      const radius = 0.66 - i * 0.07;
      const path = [];
      for (let k = 0; k <= 16; k += 1) {
        const a = (Math.PI * k) / 16;
        path.push(new Vector3(Math.cos(a) * radius, 0.96 + Math.sin(a) * radius, -0.84));
      }
      const tube = MeshBuilder.CreateTube("coaster-cart-part", { path, radius: 0.035, tessellation: 8 }, scene);
      piece(root, tube, paint(scene, hex, 0.18), 0, 0, 0);
    });
    for (const x of [-0.6, 0.6]) {
      for (const [dx, dy, d] of [[0, 0, 0.3], [0.14 * Math.sign(x), 0.05, 0.24], [-0.12 * Math.sign(x), 0.06, 0.22]]) {
        piece(root, ball(d), white, x + dx, 0.98 + dy, -0.84);
      }
    }
    piece(root, ball(0.3), white, 0, 0.62, 0.95);
  } else if (id === "gold") {
    const gold = shiny(scene);
    piece(root, box(1.2, 0.14, 1.75), gold, 0, 0.32, 0);
    piece(root, box(0.1, 0.48, 1.6), gold, -0.58, 0.58, 0);
    piece(root, box(0.1, 0.48, 1.6), gold, 0.58, 0.58, 0);
    piece(root, box(1.22, 0.1, 1.78), mats.pink, 0, 0.4, 0);
    piece(root, box(1.16, 0.72, 0.1), mats.cream, 0, 0.7, -0.8);
    piece(root, cyl(1.18, 0.1), gold, 0, 1.08, -0.8).rotation.z = Math.PI / 2;
    piece(root, box(1.16, 0.44, 0.1), gold, 0, 0.56, 0.8);
    for (const x of [-0.64, 0.64]) {
      for (const z of [-0.5, 0, 0.5]) piece(root, ball(0.12), mats.pink, x, 0.62, z);
    }
    piece(root, cyl(0.12, 0.36), gold, 0, 0.84, 0.8);
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      piece(root, cyl(0.16, 0.09, 0), gold, Math.cos(a) * 0.14, 0.98, 0.8 + Math.sin(a) * 0.14);
    }
    piece(root, ball(0.12), mats.pink, 0, 0.86, 0.99);
  } else if (id === "rocket") {
    const hull = mats.white;
    piece(root, cyl(1.7, 0.98), hull, 0, 0.5, -0.05).rotation.x = Math.PI / 2;
    for (const z of [0.38, -0.46]) piece(root, cyl(0.14, 1.02), mats.pink, 0, 0.5, z).rotation.x = Math.PI / 2;
    piece(root, cyl(0.75, 0.98, 0), mats.pink, 0, 0.5, 1.17).rotation.x = Math.PI / 2;
    for (const x of [-0.49, 0.49]) piece(root, cyl(0.05, 0.22), paint(scene, "#9fe8ff", 0.2), x, 0.58, 0.55).rotation.z = Math.PI / 2;
    piece(root, box(0.46, 0.06, 0.42), mats.gold, -0.62, 0.3, -0.72).rotation.z = -0.35;
    piece(root, box(0.46, 0.06, 0.42), mats.gold, 0.62, 0.3, -0.72).rotation.z = 0.35;
    piece(root, box(0.06, 0.4, 0.42), mats.gold, 0, 1.12, -0.72);
    const flame = piece(root, cyl(0.7, 0.58, 0), paint(scene, "#ff9a3d", 0.5), 0, 0.5, -1.24);
    flame.rotation.x = -Math.PI / 2;
    const core = piece(root, cyl(0.45, 0.32, 0), paint(scene, "#ffe066", 0.55), 0, 0.5, -1.14);
    core.rotation.x = -Math.PI / 2;
    tick = (time) => {
      const flick = 0.82 + Math.sin(time * 31) * 0.12 + Math.sin(time * 17.3) * 0.08;
      flame.scaling.set(1, flick, 1);
      core.scaling.set(1, 1.7 - flick, 1);
    };
  } else {
    piece(root, box(1.2, 0.14, 1.75), mats.pink, 0, 0.32, 0);
    piece(root, box(0.1, 0.48, 1.6), mats.cream, -0.58, 0.58, 0);
    piece(root, box(0.1, 0.48, 1.6), mats.cream, 0.58, 0.58, 0);
    piece(root, box(1.16, 0.72, 0.1), mats.cream, 0, 0.7, -0.8);
    piece(root, box(1.22, 0.1, 1.78), mats.gold, 0, 0.4, 0);
    piece(root, ball(0.28), mats.gold, 0, 0.62, 0.95);
  }
  wheels();
  return { tick: (time) => tick(time) };
}

/** Builds one decoration around its own base point. `ghost` is the see-through placing preview. */
function buildDecor(scene, kit, type, tint, ghost = false) {
  const root = new TransformNode(`coaster-decor-${type}`, scene);
  const parts = [];
  const add = (mesh, material, x, y, z) => {
    mesh.material = material;
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    parts.push(mesh);
    return mesh;
  };
  const cyl = (h, d, top = d) =>
    MeshBuilder.CreateCylinder("coaster-decor-part", { height: h, diameterBottom: d, diameterTop: top, tessellation: 10 }, scene);
  const ball = (d) => MeshBuilder.CreateSphere("coaster-decor-part", { diameter: d, segments: 8 }, scene);
  const rod = (from, to, d, material) => {
    const dir = to.subtract(from);
    const mesh = add(cyl(dir.length(), d), material, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.rotationQuaternion = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir.normalize(), mesh.rotationQuaternion);
    return mesh;
  };
  const cream = paint(scene, "#fff6ea", 0.18);
  const pink = paint(scene, "#ff4d8d", 0.2);
  const gold = paint(scene, "#ffd23f", 0.22);
  const ink = paint(scene, "#3a2433", 0.08);
  const moving = [];
  let tick = null;

  if (type === "lights") {
    for (const x of [-1.2, 1.2]) {
      add(cyl(1.5, 0.09), cream, x, 0.75, 0);
      add(ball(0.2), pink, x, 1.55, 0);
    }
    const sag = (u) => 1.45 - Math.sin(u * Math.PI) * 0.35;
    const path = [];
    for (let i = 0; i <= 12; i += 1) path.push(new Vector3(-1.2 + 2.4 * (i / 12), sag(i / 12), 0));
    add(MeshBuilder.CreateTube("coaster-decor-part", { path, radius: 0.018, tessellation: 5 }, scene), ink, 0, 0, 0);
    for (let k = 0; k < 7; k += 1) {
      const u = (k + 1) / 8;
      add(ball(0.16), kit.bulbs[k % kit.bulbs.length], -1.2 + 2.4 * u, sag(u) - 0.09, 0);
    }
  } else if (type === "flag") {
    add(cyl(0.08, 0.36), pink, 0, 0.04, 0);
    add(cyl(2, 0.07), cream, 0, 1, 0);
    add(ball(0.15), gold, 0, 2.06, 0);
    const pivot = new TransformNode("coaster-decor-pivot", scene);
    pivot.parent = root;
    pivot.position.y = 1.62;
    const pennant = MeshBuilder.CreateDisc("coaster-decor-pennant", { radius: 0.44, tessellation: 3, sideOrientation: Mesh.DOUBLESIDE }, scene);
    pennant.material = paint(scene, TINTS[tint % TINTS.length], 0.2);
    pennant.parent = pivot;
    pennant.position.x = 0.22;
    pennant.isPickable = false;
    moving.push(pennant);
    const phase = Math.random() * 6;
    tick = (time) => {
      pivot.rotation.y = Math.sin(time * 3 + phase) * 0.38;
    };
  } else if (type === "balloons") {
    add(MeshBuilder.CreateBox("coaster-decor-part", { size: 0.26 }, scene), gold, 0, 0.13, 0);
    const bunch = new TransformNode("coaster-decor-bunch", scene);
    bunch.parent = root;
    const top = [];
    const spots = [[-0.26, 2.2, 0, TINTS[0]], [0.24, 2.45, 0.1, TINTS[1]], [0, 2.78, -0.14, TINTS[2]]];
    for (const [x, y, z, hex] of spots) {
      const string = rod(new Vector3(0, 0.26, 0), new Vector3(x, y - 0.3, z), 0.02, ink);
      parts.splice(parts.indexOf(string), 1);
      top.push(string);
      const balloon = ball(0.52);
      balloon.material = paint(scene, hex, 0.18);
      balloon.position.set(x, y, z);
      balloon.scaling.y = 1.18;
      balloon.isPickable = false;
      top.push(balloon);
    }
    const merged = Mesh.MergeMeshes(top, true, true, undefined, false, true);
    merged.parent = bunch;
    merged.isPickable = false;
    moving.push(merged);
    const phase = Math.random() * 6;
    tick = (time) => {
      bunch.position.y = Math.sin(time * 1.6 + phase) * 0.07;
      bunch.rotation.y = Math.sin(time * 0.9 + phase) * 0.2;
    };
  } else if (type === "arch") {
    const path = [new Vector3(-0.85, 0, 0), new Vector3(-0.85, 1.75, 0)];
    for (let k = 1; k <= 16; k += 1) {
      const a = Math.PI - (Math.PI * k) / 16;
      path.push(new Vector3(Math.cos(a) * 0.85, 1.75 + Math.sin(a) * 0.85, 0));
    }
    path.push(new Vector3(0.85, 0, 0));
    for (const [i, chunk] of stripes(path, 0.32).entries()) {
      add(MeshBuilder.CreateTube("coaster-decor-part", { path: chunk, radius: 0.08, tessellation: 10, cap: Mesh.CAP_ALL }, scene), i % 2 ? cream : pink, 0, 0, 0);
    }
    add(ball(0.28), gold, 0, 2.68, 0);
    for (const x of [-0.85, 0.85]) add(cyl(0.08, 0.3), gold, x, 0.04, 0);
  } else {
    add(MeshBuilder.CreateBox("coaster-decor-part", { width: 0.72, height: 0.46, depth: 0.72 }, scene), pink, 0, 0.23, 0);
    add(MeshBuilder.CreateBox("coaster-decor-part", { width: 0.75, height: 0.08, depth: 0.75 }, scene), gold, 0, 0.32, 0);
    const tubes = [[-0.18, 0.05, 0.22, 0, TINTS[1]], [0.18, -0.02, -0.22, 0, TINTS[2]], [0, -0.16, 0, -0.2, TINTS[3]]];
    for (const [x, z, tiltZ, tiltX, hex] of tubes) {
      const tube = add(cyl(0.6, 0.15), paint(scene, hex, 0.18), x, 0.66, z);
      tube.rotation.set(tiltX, 0, tiltZ);
    }
  }

  const body = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  body.name = `coaster-decor-${type}`;
  body.parent = root;
  body.isPickable = false;
  const meshes = [body, ...moving];
  if (ghost) {
    for (const mesh of meshes) mesh.visibility = 0.5;
  }
  return {
    root,
    meshes,
    tick,
    dispose() {
      for (const mesh of meshes) {
        if (mesh.material && mesh.material.subMaterials) mesh.material.dispose(false, false, false);
      }
      root.dispose(false, false);
    },
  };
}

/** Splits a polyline into short alternating runs, for candy stripes. */
function stripes(path, length) {
  const out = [];
  let run = [path[0]];
  let left = length;
  for (let i = 1; i < path.length; i += 1) {
    let from = path[i - 1];
    const to = path[i];
    let span = Vector3.Distance(from, to);
    while (span > left) {
      const cut = Vector3.Lerp(from, to, left / span);
      run.push(cut);
      out.push(run);
      run = [cut];
      span -= left;
      from = cut;
      left = length;
    }
    run.push(to);
    left -= span;
  }
  if (run.length > 1) out.push(run);
  return out;
}

function addSolid(scene, x, y, z, w, h, d, material) {
  const mesh = MeshBuilder.CreateBox("coaster-shack-solid", { width: w, height: h, depth: d }, scene);
  mesh.position.set(x, y, z);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.computeWorldMatrix(true);
  const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(w, h, d), scene);
  shape.material = { friction: 0.92, restitution: 0 };
  const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
  body.shape = shape;
  body.setMassProperties({ mass: 0 });
  body.disablePreStep = true;
  return mesh;
}

function shackSign(scene, text, x, y, z, yaw, width, height) {
  const texture = new DynamicTexture("coaster-decor-sign-tex", { width: 512, height: 128 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#7dcea0";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#fff8fb";
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = "#fff8fb";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 72;
  do {
    ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 470 && size > 24);
  ctx.fillText(text, 256, 68);
  texture.update();
  const material = unlitMaterial(scene, "coaster-decor-sign", texture, { alpha: false });
  material.backFaceCulling = true;
  for (const flip of [0, Math.PI]) {
    const board = MeshBuilder.CreatePlane("coaster-decor-sign", { width, height }, scene);
    board.material = material;
    board.position.set(x, y, z);
    board.rotation.y = yaw + flip;
    board.isPickable = false;
  }
}

/** A little candy-striped hut on the deck where decorations are sold, open at the front (+z) over the counter. */
function buildShack(scene, kit, origin) {
  const sx = origin.x + DECOR_SHACK.x;
  const sy = origin.y;
  const sz = origin.z + DECOR_SHACK.z;
  const cream = paint(scene, "#fff6ea", 0.18);
  const pink = paint(scene, "#ff4d8d", 0.2);
  const mint = paint(scene, "#7dcea0", 0.16);
  const gold = paint(scene, "#ffd23f", 0.22);
  const blush = paint(scene, "#ffb3cf", 0.14);
  addSolid(scene, sx, sy + 0.5, sz + 0.55, 3.0, 1.0, 1.0, mint);
  addSolid(scene, sx, sy + 1.35, sz - 0.95, 3.3, 2.7, 0.16, blush);
  for (const side of [-1, 1]) addSolid(scene, sx + side * 1.62, sy + 1.35, sz - 0.2, 0.14, 2.7, 1.6, cream);
  const top = MeshBuilder.CreateBox("coaster-shack-top", { width: 3.2, height: 0.1, depth: 1.2 }, scene);
  top.position.set(sx, sy + 1.05, sz + 0.55);
  top.material = cream;
  top.isPickable = false;
  for (const side of [-1, 1]) {
    const post = MeshBuilder.CreateCylinder("coaster-shack-post", { height: 2.7, diameter: 0.16, tessellation: 10 }, scene);
    post.position.set(sx + side * 1.58, sy + 1.35, sz + 1.12);
    post.material = cream;
    post.isPickable = false;
    for (let k = 0; k < 6; k += 1) {
      const band = MeshBuilder.CreateTorus("coaster-shack-band", { diameter: 0.17, thickness: 0.05, tessellation: 14 }, scene);
      band.position.set(sx + side * 1.58, sy + 0.3 + k * 0.42, sz + 1.12);
      band.material = pink;
      band.isPickable = false;
    }
  }
  const tilt = 0.2;
  for (let k = 0; k < 7; k += 1) {
    const stripe = MeshBuilder.CreateBox("coaster-shack-awning", { width: 0.48, height: 0.06, depth: 2.5 }, scene);
    stripe.position.set(sx - 1.44 + k * 0.48, sy + 2.82, sz + 0.15);
    stripe.rotation.x = tilt;
    stripe.material = k % 2 ? cream : pink;
    stripe.isPickable = false;
  }
  const lip = sy + 2.82 - Math.sin(tilt) * 1.25;
  for (let k = 0; k < 8; k += 1) {
    const bump = MeshBuilder.CreateSphere("coaster-shack-scallop", { diameter: 0.3, segments: 8 }, scene);
    bump.position.set(sx - 1.58 + k * 0.45, lip - 0.06, sz + 1.38);
    bump.material = k % 2 ? gold : pink;
    bump.isPickable = false;
  }
  shackSign(scene, t("coaster.decorSign"), sx, lip + 0.5, sz + 1.45, 0, 2.9, 0.72);

  // A few things for sale, sitting on the counter.
  const showcase = [
    ["lights", sx - 0.8, 0.42],
    ["flag", sx + 0.2, 0.5],
    ["fireworks", sx + 1.0, 0.6],
  ];
  for (const [type, x, scale] of showcase) {
    const item = buildDecor(scene, kit, type, 0);
    item.root.position.set(x, sy + 1.1, sz + 0.55);
    item.root.scaling.setAll(scale);
    if (item.tick) kit.tickers.push(item.tick);
  }
  const balloons = buildDecor(scene, kit, "balloons", 0);
  balloons.root.position.set(sx - 2.1, sy, sz + 1.3);
  if (balloons.tick) kit.tickers.push(balloons.tick);

  const ring = MeshBuilder.CreateTorus("coaster-shack-ring", { diameter: 3, thickness: 0.1, tessellation: 28 }, scene);
  ring.position.set(origin.x + DECOR_SPOT.x, sy + 0.06, origin.z + DECOR_SPOT.z);
  ring.material = gold;
  ring.isPickable = false;
}

function createFireworks(scene) {
  const texture = new DynamicTexture("coaster-spark-tex", { width: 64, height: 64 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.85)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  texture.update();
  texture.hasAlpha = true;
  const systems = PALETTES.map(([a, b], i) => {
    const system = new ParticleSystem(`coaster-firework-${i}`, 260, scene);
    system.particleTexture = texture;
    system.emitter = new Vector3();
    system.createSphereEmitter(0.3, 0);
    system.emitRate = 0;
    system.manualEmitCount = 0;
    system.color1 = a;
    system.color2 = b;
    system.colorDead = new Color4(a.r, a.g, a.b, 0);
    system.minSize = 0.28;
    system.maxSize = 0.55;
    system.minLifeTime = 1.3;
    system.maxLifeTime = 2;
    system.minEmitPower = 4.5;
    system.maxEmitPower = 7;
    system.gravity = new Vector3(0, -3.5, 0);
    system.blendMode = ParticleSystem.BLENDMODE_ADD;
    system.updateSpeed = 1 / 60;
    return system;
  });
  let next = 0;
  return {
    shell(x, y, z) {
      const system = systems[next];
      next = (next + 1) % systems.length;
      system.emitter.set(x, y, z);
      system.manualEmitCount = 120;
      if (!system.isStarted()) system.start();
    },
  };
}

/**
 * The upgrade panel (bigger platform and carts, from the on-screen Upgrade button), the decor panel
 * (from the Decor shack on the deck), and placing bought decorations by clicking the track or deck.
 */
export function bindCoasterUpgrades(scene, coaster, { coins, blip, onCoins }) {
  const root = document.querySelector("#coaster-upgrades");
  const body = document.querySelector("#coaster-upgrades-body");
  const hud = document.querySelector("#coaster-hud");
  const bar = document.querySelector("#coaster-place");
  if (!root || !body || !hud || !bar) {
    return { get open() { return false; }, get placing() { return false; }, show() {}, close() {}, cheer() {}, tick() {} };
  }
  const kicker = document.querySelector("#coaster-upgrades-kicker");
  const title = document.querySelector("#coaster-upgrades-title");
  const note = document.querySelector("#coaster-upgrades-note");
  const status = document.querySelector("#coaster-upgrades-status");
  const badge = document.querySelector("#coaster-upgrades-coins");
  const placeButton = document.querySelector("#coaster-upgrades-place");
  const upgradeOpen = document.querySelector("#coaster-upgrades-open");
  const decorateOpen = document.querySelector("#coaster-place-open");
  const chips = document.querySelector("#coaster-place-items");
  const hint = document.querySelector("#coaster-place-hint");
  const pickUp = document.querySelector("#coaster-place-remove");
  const done = document.querySelector("#coaster-place-done");
  const canvas = scene.getEngine().getRenderingCanvas();
  const state = coaster.upgrades;
  const origin = coaster.origin;

  const kit = {
    bulbs: BULBS.map((hex, i) => plainMaterial(scene, `coaster-bulb-${i}`, hex, 0.4)),
    tickers: [],
  };
  buildShack(scene, kit, origin);
  const fireworks = createFireworks(scene);
  const placedKits = new Map();
  for (const record of state.placed) spawn(record);

  const marker = MeshBuilder.CreateTorus("coaster-decor-pick", { diameter: 1.7, thickness: 0.09, tessellation: 28 }, scene);
  marker.material = paint(scene, "#ff4d8d", 0.45);
  marker.isPickable = false;
  marker.setEnabled(false);

  let open = false;
  let mode = "upgrades";
  let placing = false;
  let pick = null;
  let chosen = null;
  let ghost = null;
  let down = null;
  let hudShown = null;
  let decorateShown = null;

  const sections = {
    upgrades: [section("🏗️", t("upgrade.platform"), DECK_TIERS, "deck"), section("🎢", t("upgrade.carts"), CARTS, "cart")],
    decor: [section("✨", t("upgrade.decor"), DECOR, "decor")],
  };

  function section(emoji, label, items, kind) {
    const wrap = document.createElement("section");
    wrap.className = "upgrade-section";
    const head = document.createElement("h3");
    head.textContent = `${emoji} ${label}`;
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "shop-item upgrade-card";
      const swatch = document.createElement("span");
      swatch.className = "upgrade-swatch";
      swatch.textContent = item.emoji;
      swatch.setAttribute("aria-hidden", "true");
      if (item.swatch) swatch.style.background = item.swatch;
      const name = document.createElement("strong");
      name.textContent = t(item.nameKey);
      const sub = document.createElement("span");
      sub.className = "upgrade-sub";
      if (kind === "deck") sub.textContent = t("upgrade.size").replace("{w}", String(item.half * 2)).replace("{d}", String(DECK_FRONT - item.back));
      else if (kind === "decor") sub.textContent = t(item.hintKey);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.kind = kind;
      button.dataset.index = String(index);
      card.append(swatch, name, sub);
      if (kind === "decor") {
        const stock = document.createElement("span");
        stock.className = "upgrade-stock";
        card.append(stock);
      }
      card.append(button);
      grid.append(card);
      button.addEventListener("click", () => choose(kind, index));
    });
    wrap.append(head, grid);
    body.append(wrap);
    return wrap;
  }

  function wallet() {
    return Math.max(0, Math.floor(Number(coins.coins)) || 0);
  }

  function buy(cost) {
    if (spendCoins(coins, cost)) return true;
    paintPanel(t("upgrade.broke"));
    return false;
  }

  function choose(kind, index) {
    if (coaster.riding) return;
    if (kind === "deck") {
      const tier = DECK_TIERS[index];
      if (index !== state.deck + 1 || !buy(tier.cost)) return;
      coaster.setDeckSize(index);
      blip?.("ding");
      onCoins?.();
      paintPanel(t("upgrade.bigger").replace("{name}", t(tier.nameKey)));
    } else if (kind === "cart") {
      const cart = CARTS[index];
      if (state.cart === cart.id) return;
      const owned = state.carts.includes(cart.id);
      if (!owned && !buy(cart.cost)) return;
      coaster.setCartStyle(cart.id);
      blip?.(owned ? "clank" : "ding");
      onCoins?.();
      paintPanel(t(owned ? "upgrade.usingCart" : "upgrade.gotCart").replace("{name}", t(cart.nameKey)));
    } else {
      const item = DECOR[index];
      if (state.decor[item.id] >= MAX_STOCK || !buy(item.cost)) return;
      state.decor[item.id] += 1;
      coaster.saveUpgrades();
      blip?.("clank");
      onCoins?.();
      paintPanel(t("upgrade.gotDecor").replace("{name}", t(item.nameKey)));
    }
  }

  function paintPanel(message) {
    const count = wallet();
    if (badge) badge.textContent = String(count);
    if (status) status.textContent = message ?? "";
    body.querySelectorAll("button[data-kind]").forEach((button) => {
      const index = Number(button.dataset.index);
      const kind = button.dataset.kind;
      const card = button.closest(".shop-item");
      button.className = "";
      if (kind === "deck") {
        const tier = DECK_TIERS[index];
        const owned = index <= state.deck;
        card.classList.toggle("is-owned", owned);
        button.disabled = owned || index !== state.deck + 1;
        if (owned) button.textContent = t("upgrade.owned");
        else if (index === state.deck + 1) priced(button, tier.cost, count);
        else {
          button.classList.add("is-locked");
          button.textContent = t("upgrade.locked");
        }
      } else if (kind === "cart") {
        const cart = CARTS[index];
        const owned = state.carts.includes(cart.id);
        const using = state.cart === cart.id;
        card.classList.toggle("is-owned", owned);
        button.disabled = using;
        if (using) button.textContent = t("upgrade.riding");
        else if (owned) {
          button.classList.add("is-use");
          button.textContent = t("upgrade.use");
        } else priced(button, cart.cost, count);
      } else {
        const item = DECOR[index];
        priced(button, item.cost, count);
        const have = state.decor[item.id];
        const stock = card.querySelector(".upgrade-stock");
        if (stock) stock.textContent = t("upgrade.stock").replace("{n}", String(have));
      }
    });
    if (placeButton) placeButton.disabled = !ownsDecor();
  }

  function priced(button, cost, count) {
    button.classList.toggle("is-short", count < cost);
    button.disabled = coaster.riding;
    button.replaceChildren(`${t("shop.buy")} · ${cost}`, coinGlyph());
  }

  function ownsDecor() {
    return state.placed.length > 0 || DECOR.some((item) => state.decor[item.id] > 0);
  }

  function setOpen(next, nextMode = mode) {
    if (next) stopPlacing();
    open = next && coaster.active && !coaster.riding;
    mode = nextMode;
    root.hidden = !open;
    if (!open) return;
    const decor = mode === "decor";
    for (const wrap of sections.upgrades) wrap.hidden = decor;
    for (const wrap of sections.decor) wrap.hidden = !decor;
    if (placeButton) placeButton.hidden = !decor;
    if (kicker) kicker.textContent = t(decor ? "upgrade.decorKicker" : "upgrade.kicker");
    if (title) title.textContent = t(decor ? "upgrade.decorTitle" : "upgrade.title");
    if (note) note.textContent = t(decor ? "upgrade.decorNote" : "upgrade.note");
    paintPanel();
    document.querySelector("#coaster-upgrades-close")?.focus();
  }

  function spawn(record) {
    const item = buildDecor(scene, kit, record.type, record.tint);
    item.root.position.set(origin.x + record.x, origin.y + record.y, origin.z + record.z);
    item.root.rotation.y = record.yaw;
    for (const mesh of item.meshes) {
      mesh.isPickable = true;
      mesh.metadata = { coasterDecor: record };
    }
    placedKits.set(record, item);
  }

  function startPlacing() {
    if (!coaster.active || coaster.riding || !ownsDecor()) return;
    setOpen(false);
    coaster.stopTool?.();
    placing = true;
    chosen = null;
    if (!pick || state.decor[pick] <= 0) pick = DECOR.find((item) => state.decor[item.id] > 0)?.id ?? null;
    document.body.classList.add("coaster-placing");
    paintBar();
  }

  function stopPlacing() {
    if (!placing) return;
    placing = false;
    chosen = null;
    down = null;
    marker.setEnabled(false);
    clearGhost();
    document.body.classList.remove("coaster-placing");
    bar.hidden = true;
  }

  function clearGhost() {
    ghost?.item.dispose();
    ghost = null;
  }

  function paintBar(message) {
    bar.hidden = !placing;
    if (!placing) return;
    chips.replaceChildren();
    for (const item of DECOR) {
      const have = state.decor[item.id];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "place-chip";
      chip.textContent = `${item.emoji} ×${have}`;
      chip.title = t(item.nameKey);
      chip.setAttribute("aria-label", `${t(item.nameKey)} ×${have}`);
      chip.setAttribute("aria-pressed", String(pick === item.id && !chosen));
      chip.disabled = have <= 0;
      chip.addEventListener("click", () => {
        pick = item.id;
        chosen = null;
        marker.setEnabled(false);
        clearGhost();
        chip.blur();
        paintBar();
      });
      chips.append(chip);
    }
    pickUp.hidden = !chosen;
    if (message) hint.textContent = message;
    else if (chosen) hint.textContent = t("upgrade.placeChosen").replace("{name}", t(decorById(chosen.type).nameKey));
    else if (pick && state.decor[pick] > 0) hint.textContent = t("upgrade.placeHint").replace("{name}", t(decorById(pick).nameKey));
    else hint.textContent = t("upgrade.placeEmpty");
  }

  function rayAt(clientX, clientY) {
    const engine = scene.getEngine();
    const camera = scene.activeCamera;
    const rect = canvas?.getBoundingClientRect();
    if (!camera || !rect || rect.width < 1 || rect.height < 1) return null;
    const scale = engine.getHardwareScalingLevel();
    const x = ((clientX - rect.left) / rect.width) * engine.getRenderWidth() * scale;
    const y = ((clientY - rect.top) / rect.height) * engine.getRenderHeight() * scale;
    return scene.createPickingRay(x, y, Matrix.Identity(), camera);
  }

  /** What the pointer is over: a placed decoration, a track point, or a spot on the deck. */
  function aim(clientX, clientY) {
    const ray = rayAt(clientX, clientY);
    if (!ray) return null;
    const hit = scene.pickWithRay(ray, (mesh) => mesh.isEnabled() && Boolean(mesh.metadata?.coasterDecor));
    let best = null;
    if (ray.direction.y < -1e-4) {
      const along = (origin.y - ray.origin.y) / ray.direction.y;
      const x = ray.origin.x + ray.direction.x * along - origin.x;
      const z = ray.origin.z + ray.direction.z * along - origin.z;
      const deck = coaster.deck;
      if (along > 0 && Math.abs(x) <= deck.half - 0.9 && z >= deck.back + 0.9 && z <= deck.front - 0.9) {
        best = { kind: "deck", along, x, y: 0, z };
      }
    }
    const track = coaster.track;
    let near = null;
    for (let i = 0; i < track.length; i += 1) {
      const p = track[i];
      const q = track[Math.min(track.length - 1, i + 1)];
      const r = track[Math.max(0, i - 1)];
      const ahead = i < track.length - 1 ? (q.x - p.x) * Math.sin(p.heading) + (q.z - p.z) * Math.cos(p.heading) : (p.x - r.x) * Math.sin(p.heading) + (p.z - r.z) * Math.cos(p.heading);
      // Upside down at the top of a loop, or straight up its sides: nothing sits there.
      if (Math.abs(p.pitch) > 1 || ahead < 0) continue;
      const vx = origin.x + p.x - ray.origin.x;
      const vy = origin.y + p.y - ray.origin.y;
      const vz = origin.z + p.z - ray.origin.z;
      const along = vx * ray.direction.x + vy * ray.direction.y + vz * ray.direction.z;
      if (along <= 0) continue;
      const miss = vx * vx + vy * vy + vz * vz - along * along;
      const reach = Math.max(1.1, along * 0.035);
      const score = miss / (reach * reach);
      if (score <= 1 && (!near || score < near.score)) near = { kind: "track", along, score, x: p.x, y: p.y, z: p.z, heading: p.heading };
    }
    if (near && (!best || near.along <= best.along + 1.5)) best = near;
    if (hit?.hit && (!best || hit.distance <= best.along + 0.6)) return { kind: "decor", record: hit.pickedMesh.metadata.coasterDecor };
    return best;
  }

  function poseFor(type, target) {
    if (target.kind === "track") {
      const h = target.heading;
      if (type === "arch") return { x: target.x, y: target.y - 0.05, z: target.z, yaw: h, track: true };
      const yaw = type === "lights" ? h - Math.PI / 2 : type === "flag" ? h + Math.PI : h;
      return {
        x: target.x - Math.cos(h) * TRACK_SIDE,
        y: target.y - 0.1,
        z: target.z + Math.sin(h) * TRACK_SIDE,
        yaw,
        track: true,
      };
    }
    const eye = scene.activeCamera?.globalPosition ?? new Vector3(origin.x, origin.y, origin.z - 10);
    const yaw = Math.atan2(eye.x - (origin.x + target.x), eye.z - (origin.z + target.z));
    return { x: target.x, y: 0, z: target.z, yaw, track: false };
  }

  function preview(clientX, clientY) {
    if (!pick || chosen || state.decor[pick] <= 0) {
      clearGhost();
      return;
    }
    const target = aim(clientX, clientY);
    if (!target || target.kind === "decor") {
      if (ghost) ghost.item.root.setEnabled(false);
      return;
    }
    if (!ghost || ghost.type !== pick) {
      clearGhost();
      ghost = { type: pick, item: buildDecor(scene, kit, pick, state.placed.length, true) };
    }
    const pose = poseFor(pick, target);
    ghost.item.root.setEnabled(true);
    ghost.item.root.position.set(origin.x + pose.x, origin.y + pose.y, origin.z + pose.z);
    ghost.item.root.rotation.y = pose.yaw;
  }

  function tap(clientX, clientY) {
    const target = aim(clientX, clientY);
    if (target?.kind === "decor") {
      chosen = target.record;
      const item = placedKits.get(chosen);
      marker.setEnabled(Boolean(item));
      if (item) marker.position.copyFrom(item.root.position).addInPlaceFromFloats(0, 0.08, 0);
      clearGhost();
      blip?.("clank");
      paintBar();
      return;
    }
    if (chosen) {
      chosen = null;
      marker.setEnabled(false);
      paintBar();
      return;
    }
    if (!target) return;
    if (!pick || state.decor[pick] <= 0) {
      paintBar(t("upgrade.placeEmpty"));
      return;
    }
    if (state.placed.length >= MAX_PLACED) {
      paintBar(t("upgrade.placeFull"));
      return;
    }
    const pose = poseFor(pick, target);
    const record = {
      type: pick,
      x: round(pose.x),
      y: round(pose.y),
      z: round(pose.z),
      yaw: round(pose.yaw),
      track: pose.track,
      tint: state.placed.length % TINTS.length,
    };
    state.placed.push(record);
    state.decor[pick] -= 1;
    spawn(record);
    coaster.saveUpgrades();
    blip?.("thump");
    if (state.decor[pick] <= 0) {
      pick = DECOR.find((item) => state.decor[item.id] > 0)?.id ?? pick;
      clearGhost();
    }
    paintBar(t("upgrade.placed").replace("{name}", t(decorById(record.type).nameKey)));
  }

  function removeChosen() {
    if (!chosen) return;
    const record = chosen;
    const index = state.placed.indexOf(record);
    if (index >= 0) state.placed.splice(index, 1);
    placedKits.get(record)?.dispose();
    placedKits.delete(record);
    state.decor[record.type] = Math.min(MAX_STOCK, state.decor[record.type] + 1);
    coaster.saveUpgrades();
    chosen = null;
    pick = record.type;
    marker.setEnabled(false);
    blip?.("clank");
    paintBar(t("upgrade.pickedUp").replace("{name}", t(decorById(record.type).nameKey)));
  }

  canvas?.addEventListener("pointerdown", (event) => {
    if (!placing || (event.pointerType === "mouse" && event.button !== 0)) return;
    down = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
  });
  canvas?.addEventListener("pointermove", (event) => {
    if (placing && event.pointerType === "mouse" && !down) preview(event.clientX, event.clientY);
  });
  canvas?.addEventListener("pointerup", (event) => {
    if (!placing || !down || down.id !== event.pointerId) return;
    const quick = performance.now() - down.time < TAP_MS;
    const still = Math.hypot(event.clientX - down.x, event.clientY - down.y) < TAP_PX;
    down = null;
    if (quick && still) tap(event.clientX, event.clientY);
  });
  canvas?.addEventListener("pointercancel", () => {
    down = null;
  });

  root.querySelector("#coaster-upgrades-backdrop")?.addEventListener("click", () => setOpen(false));
  document.querySelector("#coaster-upgrades-close")?.addEventListener("click", () => setOpen(false));
  placeButton?.addEventListener("click", () => startPlacing());
  upgradeOpen?.addEventListener("click", () => {
    upgradeOpen.blur();
    setOpen(true, "upgrades");
  });
  decorateOpen?.addEventListener("click", () => {
    decorateOpen.blur();
    startPlacing();
  });
  pickUp?.addEventListener("click", () => {
    pickUp.blur();
    removeChosen();
  });
  done?.addEventListener("click", () => {
    done.blur();
    stopPlacing();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape") return;
    if (open) {
      event.preventDefault();
      setOpen(false);
    } else if (placing) {
      event.preventDefault();
      stopPlacing();
    }
  });

  return {
    get open() {
      return open;
    },
    get placing() {
      return placing;
    },
    /** `which` is "upgrades" (platform and carts) or "decor" (the Decor shack). */
    show(which = "upgrades") {
      setOpen(true, which === "decor" ? "decor" : "upgrades");
    },
    close() {
      setOpen(false);
      stopPlacing();
    },
    /** A ride just came home: every firework launcher pops. */
    cheer() {
      const launchers = state.placed.filter((record) => record.type === "fireworks").slice(0, 8);
      launchers.forEach((record, i) => {
        for (const [delay, lift] of [[0, 5.5], [0.45, 7.5], [0.9, 6.5]]) {
          setTimeout(() => {
            if (!coaster.active) return;
            fireworks.shell(
              origin.x + record.x + (Math.random() - 0.5) * 1.6,
              origin.y + record.y + lift + Math.random(),
              origin.z + record.z + (Math.random() - 0.5) * 1.6,
            );
            if (delay === 0 && i < 3) blip?.("thump");
          }, (i * 0.3 + delay) * 1000);
        }
      });
    },
    tick(_dt, time, menus = false) {
      // The parts tool (placing or removing track parts) uses the same clicks, so only one runs.
      if (placing && (!coaster.active || coaster.riding || menus || coaster.toolKind)) stopPlacing();
      if (open && (!coaster.active || coaster.riding)) setOpen(false);
      const showHud = coaster.active && !coaster.riding && !open && !placing && !menus && !coaster.toolKind;
      if (showHud !== hudShown) {
        hudShown = showHud;
        hud.hidden = !showHud;
      }
      const decorate = ownsDecor();
      if (decorate !== decorateShown && decorateOpen) {
        decorateShown = decorate;
        decorateOpen.hidden = !decorate;
      }
      if (!coaster.active) return;
      kit.bulbs.forEach((material, i) => {
        const glow = 0.28 + 0.22 * Math.max(0, Math.sin(time * 2.6 + i * 1.7));
        material.emissiveColor.copyFrom(material.diffuseColor).scaleInPlace(glow);
      });
      for (const tick of kit.tickers) tick(time);
      for (const item of placedKits.values()) item.tick?.(time);
      ghost?.item.tick?.(time);
      if (marker.isEnabled()) marker.scaling.setAll(1 + Math.sin(time * 5) * 0.08);
    },
  };
}

function decorById(id) {
  return DECOR.find((item) => item.id === id) ?? DECOR[0];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function coinGlyph() {
  const glyph = document.createElement("span");
  glyph.className = "coin-glyph";
  glyph.setAttribute("aria-hidden", "true");
  return glyph;
}
