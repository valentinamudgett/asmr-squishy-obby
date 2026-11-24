import { DynamicTexture, Mesh, MeshBuilder, Quaternion } from "@babylonjs/core";
import { BOT_YARD, PARTS, buildTrack } from "./coaster.js";
import { t } from "./i18n.js";
import { plainMaterial, unlitMaterial } from "./seasons.js";

const SAVE_KEY = "asmr-squishy-obby:bot-coasters";
/** How long a bot keeps a track before changing one piece. */
const LIFE = 3 * 60 * 1000;
/** Models sit left of the stand-here ring. BOT_YARD.reach still covers the row. */
const ROW_X = -2.7;
const ROW_GAP = 2.35;

const MAKERS = [
  {
    id: "pip",
    nameKey: "coaster.botPip",
    color: "#ff4d8d",
    seed: ["straight", "hill", "bunny", "straight", "drop", "straight"],
    likes: ["hill", "bunny", "drop", "climb", "straight"],
  },
  {
    id: "nori",
    nameKey: "coaster.botNori",
    color: "#ffd23f",
    seed: ["straight", "climb", "loop", "drop", "straight"],
    likes: ["loop", "climb", "drop", "bunny", "straight"],
  },
  {
    id: "momo",
    nameKey: "coaster.botMomo",
    color: "#7dcea0",
    seed: ["straight", "right", "hill", "left", "bunny", "straight"],
    likes: ["left", "right", "hill", "bunny", "straight"],
  },
  {
    id: "bo",
    nameKey: "coaster.botBo",
    color: "#8eb6ff",
    seed: ["straight", "helix", "drop", "brake"],
    likes: ["helix", "brake", "drop", "hill", "straight"],
  },
  {
    id: "lulu",
    nameKey: "coaster.botLulu",
    color: "#ff9ec4",
    seed: ["straight", "climb", "cork", "drop", "straight"],
    likes: ["cork", "zerog", "climb", "immel", "straight"],
  },
];

const KNOWN = new Set(PARTS.map((part) => part.id));

/**
 * Coasters the yard bots are building, saved in this browser. A handful of named tracks,
 * each a list of real part ids. One of them changes every few minutes.
 */
export function loadBotCoasters(now = Date.now()) {
  let saved = [];
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (Array.isArray(data?.rides)) saved = data.rides;
  } catch {
    saved = [];
  }
  let dirty = false;
  const rides = MAKERS.map((maker, index) => {
    const row = saved.find((item) => item?.id === maker.id);
    const parts = Array.isArray(row?.parts) ? row.parts.filter((id) => KNOWN.has(id)).slice(0, 8) : [];
    const until = Number(row?.until);
    if (parts.length < 2 || parts[0] !== "straight" || !Number.isFinite(until)) {
      dirty = true;
      return freshRide(maker, index, now);
    }
    return { id: maker.id, parts, until };
  });
  for (const ride of rides) {
    if (now < ride.until) continue;
    const maker = MAKERS.find((item) => item.id === ride.id);
    const rng = mulberry32((now ^ hashId(ride.id)) >>> 0);
    ride.parts = evolve(maker, ride.parts, rng);
    ride.until = now + LIFE + Math.floor(rng() * 45_000);
    dirty = true;
  }
  if (dirty) saveRides(rides);
  return rides;
}

/**
 * The board on the left of the deck: a row of real tracks, plus the sheet where you pick one to ride.
 * Riding goes through coaster.rideBot, on a station off to the right of the yard, and pays the same.
 */
export function bindBotCoasters(scene, coaster, { coins, blip } = {}) {
  const rides = loadBotCoasters();
  const origin = coaster.origin;
  const mats = {
    wood: plainMaterial(scene, "coaster-bot-wood", "#e7b07a", 0.12),
    cream: plainMaterial(scene, "coaster-bot-cream", "#fff6ea", 0.18),
    pink: plainMaterial(scene, "coaster-bot-pink", "#ff4d8d", 0.2),
    gold: plainMaterial(scene, "coaster-bot-gold", "#ffd23f", 0.22),
    tie: plainMaterial(scene, "coaster-bot-tie", "#c9844a", 0.1),
  };
  const colors = new Map(MAKERS.map((maker) => [maker.id, plainMaterial(scene, `coaster-bot-rail-${maker.id}`, maker.color, 0.2)]));
  const slots = [];
  buildBoard(scene, mats, origin);
  MAKERS.forEach((maker, index) => {
    const pad = padAt(index);
    const ride = rides.find((item) => item.id === maker.id);
    slots.push({
      id: maker.id,
      pad,
      rails: layModel(scene, ride?.parts ?? maker.seed, colors.get(maker.id), mats, origin, pad),
    });
    sign(
      scene,
      `coaster-bot-name-${maker.id}`,
      t(maker.nameKey),
      origin.x + pad.x + 0.88,
      origin.y + 0.68,
      origin.z + pad.z,
      Math.PI / 2,
      1.25,
      0.32,
      maker.color,
      "#3a2433",
    );
  });

  const root = document.querySelector("#coaster-bots");
  const list = document.querySelector("#coaster-bots-list");
  const badge = document.querySelector("#coaster-bots-coins");
  let open = false;
  let wait = 1;

  function paint() {
    if (!list) return;
    list.replaceChildren();
    for (const ride of rides) {
      const maker = MAKERS.find((item) => item.id === ride.id);
      if (!maker) continue;
      const card = document.createElement("article");
      card.className = "shop-item";
      const glyphs = document.createElement("span");
      glyphs.className = "bot-track";
      glyphs.textContent = ride.parts.map((id) => PARTS.find((part) => part.id === id)?.emoji ?? "").join("");
      const name = document.createElement("strong");
      name.textContent = t("coaster.botsBy").replace("{name}", t(maker.nameKey));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = t("coaster.botsRide");
      button.addEventListener("click", () => {
        setOpen(false);
        if (coaster.rideBot(ride.parts)) blip?.("clank");
      });
      card.append(glyphs, name, button);
      list.append(card);
    }
    showCoins();
  }

  function showCoins() {
    if (!badge) return;
    badge.textContent = String(Math.max(0, Math.floor(Number(coins?.coins)) || 0));
  }

  function setOpen(next) {
    open = Boolean(next) && coaster.active && !coaster.riding && Boolean(root);
    if (root) root.hidden = !open;
    if (open) {
      coaster.stopTool();
      paint();
      document.querySelector("#coaster-bots-close")?.focus();
    }
  }

  function redraw(id) {
    const slot = slots.find((item) => item.id === id);
    const ride = rides.find((item) => item.id === id);
    if (!slot || !ride) return;
    for (const mesh of slot.rails) mesh.dispose(false, false);
    slot.rails = layModel(scene, ride.parts, colors.get(id), mats, origin, slot.pad);
  }

  root?.querySelector("#coaster-bots-backdrop")?.addEventListener("click", () => setOpen(false));
  document.querySelector("#coaster-bots-close")?.addEventListener("click", () => setOpen(false));
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
  });

  return {
    get open() {
      return open;
    },
    get rides() {
      return rides;
    },
    show() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    tick(dt) {
      if (open) showCoins();
      if (open && coaster.riding) setOpen(false);
      wait -= dt;
      if (wait > 0) return;
      wait = 1;
      const changed = ageRides(rides, Date.now());
      if (!changed.length) return;
      for (const id of changed) redraw(id);
      if (open) paint();
    },
  };
}

function ageRides(rides, now) {
  const changed = [];
  for (const ride of rides) {
    if (now < ride.until) continue;
    const maker = MAKERS.find((item) => item.id === ride.id);
    if (!maker) continue;
    const rng = mulberry32((now ^ hashId(ride.id)) >>> 0);
    ride.parts = evolve(maker, ride.parts, rng);
    ride.until = now + LIFE + Math.floor(rng() * 45_000);
    changed.push(ride.id);
  }
  if (changed.length) saveRides(rides);
  return changed;
}

function freshRide(maker, index, now) {
  return {
    id: maker.id,
    parts: maker.seed.filter((id) => KNOWN.has(id)),
    until: now + LIFE + index * 45_000,
  };
}

function evolve(maker, parts, rng) {
  const next = parts.filter((id) => KNOWN.has(id));
  if (next.length < 2 || next[0] !== "straight") return maker.seed.filter((id) => KNOWN.has(id));
  const pool = maker.likes.filter((id) => KNOWN.has(id) && id !== "up" && id !== "down");
  const pick = pool[Math.floor(rng() * pool.length)] ?? "straight";
  if (next.length < 8 && rng() < 0.5) next.splice(1 + Math.floor(rng() * next.length), 0, pick);
  else next[1 + Math.floor(rng() * (next.length - 1))] = pick;
  return next.slice(0, 8);
}

function saveRides(rides) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ rides }));
  } catch {
    // Private mode: the bots just rebuild next visit.
  }
}

function padAt(index) {
  return { x: BOT_YARD.x + ROW_X, z: BOT_YARD.z + (index - 2) * ROW_GAP };
}

function buildBoard(scene, mats, origin) {
  const x = BOT_YARD.x + ROW_X - 1.35;
  const z = BOT_YARD.z;
  const board = MeshBuilder.CreateBox("coaster-bot-board", { width: 0.16, height: 2.55, depth: 11.6 }, scene);
  board.position.set(origin.x + x, origin.y + 1.35, origin.z + z);
  board.material = mats.wood;
  board.isPickable = false;
  const stripe = MeshBuilder.CreateBox("coaster-bot-stripe", { width: 0.2, height: 0.12, depth: 11.6 }, scene);
  stripe.position.set(origin.x + x, origin.y + 2.55, origin.z + z);
  stripe.material = mats.pink;
  stripe.isPickable = false;
  for (const side of [-1, 1]) {
    const post = MeshBuilder.CreateCylinder("coaster-bot-post", { height: 2.7, diameter: 0.14, tessellation: 8 }, scene);
    post.position.set(origin.x + x, origin.y + 1.35, origin.z + z + side * 5.7);
    post.material = mats.cream;
    post.isPickable = false;
  }
  MAKERS.forEach((_, index) => {
    const pad = padAt(index);
    const box = MeshBuilder.CreateBox("coaster-bot-plinth", { width: 1.7, height: 0.42, depth: 2.05 }, scene);
    box.position.set(origin.x + pad.x, origin.y + 0.21, origin.z + pad.z);
    box.material = index % 2 === 0 ? mats.cream : mats.wood;
    box.isPickable = false;
  });
  const ring = MeshBuilder.CreateTorus("coaster-bot-ring", { diameter: 2.7, thickness: 0.1, tessellation: 28 }, scene);
  ring.position.set(origin.x + BOT_YARD.x, origin.y + 0.06, origin.z + BOT_YARD.z);
  ring.material = mats.pink;
  ring.isPickable = false;
  const balloon = MeshBuilder.CreateSphere("coaster-bot-balloon", { diameter: 0.55, segments: 12 }, scene);
  balloon.position.set(origin.x + x + 0.35, origin.y + 3.15, origin.z + z + 4.6);
  balloon.material = mats.gold;
  balloon.isPickable = false;
}

/** A scaled copy of a track from buildTrack, sitting on one plinth. */
function layModel(scene, ids, railMat, mats, origin, pad) {
  const parts = (ids ?? []).filter((id) => KNOWN.has(id));
  const track = buildTrack(parts.length ? parts : ["straight", "hill", "straight"]);
  const fitted = fit(track.points);
  const rails = [];
  const ties = [];
  const brakes = [];
  const gauge = 0.11;
  const y0 = origin.y + 0.44;
  for (let i = 0; i < fitted.length - 1; i += 1) {
    const a = fitted[i];
    const b = fitted[i + 1];
    const aSide = lateral(a.heading, gauge);
    const bSide = lateral(b.heading, gauge);
    const ax = origin.x + pad.x + a.x;
    const az = origin.z + pad.z + a.z;
    const bx = origin.x + pad.x + b.x;
    const bz = origin.z + pad.z + b.z;
    railSpan(scene, rails, 0.035, 0.024, ax + aSide.x, y0 + a.y, az + aSide.z, bx + bSide.x, y0 + b.y, bz + bSide.z);
    railSpan(scene, rails, 0.035, 0.024, ax - aSide.x, y0 + a.y, az - aSide.z, bx - bSide.x, y0 + b.y, bz - bSide.z);
    if (i % 4 === 0) {
      railSpan(scene, ties, gauge * 2.2, 0.02, ax - aSide.x, y0 + a.y - 0.02, az - aSide.z, ax + aSide.x, y0 + a.y - 0.02, az + aSide.z);
      if ((a.pace ?? 1) < 0.75) {
        railSpan(
          scene,
          brakes,
          gauge * 1.3,
          0.018,
          ax - aSide.x * 0.55,
          y0 + a.y + 0.03,
          az - aSide.z * 0.55,
          ax + aSide.x * 0.55,
          y0 + a.y + 0.03,
          az + aSide.z * 0.55,
        );
      }
    }
  }
  return [
    ...keep(`coaster-bot-rails-${pad.z}`, rails, railMat),
    ...keep(`coaster-bot-ties-${pad.z}`, ties, mats.tie),
    ...keep(`coaster-bot-brakes-${pad.z}`, brakes, mats.gold),
  ];
}

function fit(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, maxY - minY, 1);
  const scale = 1.5 / span;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return points.map((point) => ({
    x: (point.x - cx) * scale,
    y: (point.y - minY) * scale,
    z: (point.z - cz) * scale,
    heading: point.heading,
    pace: point.pace,
  }));
}

function lateral(heading, amount) {
  return { x: Math.cos(heading) * amount, z: -Math.sin(heading) * amount };
}

function railSpan(scene, list, width, height, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.006) return;
  const mesh = MeshBuilder.CreateBox("coaster-bot-span", { width, height, depth: len }, scene);
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.atan2(dx, dz), -Math.atan2(dy, Math.hypot(dx, dz)), 0);
  mesh.isPickable = false;
  list.push(mesh);
}

function keep(name, meshes, material) {
  if (!meshes.length) return [];
  const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  const kept = merged ? [merged] : meshes;
  if (merged) merged.name = name;
  for (const mesh of kept) {
    mesh.material = material;
    mesh.isPickable = false;
  }
  return kept;
}

function sign(scene, name, text, x, y, z, yaw, width, height, background, ink) {
  const texture = new DynamicTexture(`${name}-tex`, { width: 512, height: 256 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 14;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 92;
  do {
    ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 460 && size > 28);
  ctx.fillText(text, 256, 132);
  texture.update();
  const material = unlitMaterial(scene, `${name}-mat`, texture, { alpha: false });
  material.backFaceCulling = true;
  return [0, Math.PI].map((flip) => {
    const board = MeshBuilder.CreatePlane(`${name}-board`, { width, height }, scene);
    board.material = material;
    board.position.set(x, y, z);
    board.rotation.y = yaw + flip;
    board.isPickable = false;
    return board;
  });
}

function hashId(id) {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (Math.imul(n, 33) + id.charCodeAt(i)) | 0;
  return n;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
