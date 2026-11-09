import { Color3, MeshBuilder, StandardMaterial, TransformNode } from "@babylonjs/core";
import { buildGradientSky, buildStarField } from "./seasons.js";
import { t } from "./i18n.js";

/** Saved on the coaster upgrades object. "space" is the yard's usual Earth-and-stars look. */
export const COASTER_SKIES = [
  { id: "space", nameKey: "sky.space", emoji: "🪐", swatch: "linear-gradient(180deg, #1a2f6b, #07060f)" },
  { id: "hollywood", nameKey: "sky.hollywood", emoji: "🌴", swatch: "linear-gradient(180deg, #ffb7c9 0%, #ffd0b0 45%, #5aa9e6 100%)" },
  { id: "newyork", nameKey: "sky.newyork", emoji: "🌃", swatch: "linear-gradient(180deg, #2a2878, #12183c 70%, #1a2744)" },
  { id: "lava", nameKey: "sky.lava", emoji: "🌋", swatch: "linear-gradient(180deg, #7fb0ff 0%, #ff8a5a 55%, #5a1420)" },
  { id: "carnival", nameKey: "sky.carnival", emoji: "🎡", swatch: "linear-gradient(180deg, #5a2d98, #ff7eb3 40%, #ffb04a 78%)" },
  { id: "starry", nameKey: "sky.starry", emoji: "🌙", swatch: "linear-gradient(180deg, #14103a, #070818 60%, #1c2448)" },
  { id: "candy", nameKey: "sky.candy", emoji: "☁️", swatch: "linear-gradient(180deg, #7ec8ff, #fff6ea 55%, #ffd0ea)" },
];

const SKY_IDS = new Set(COASTER_SKIES.map((sky) => sky.id));

export function isCoasterSky(id) {
  return SKY_IDS.has(id);
}

function skyHint(id) {
  switch (id) {
    case "hollywood":
      return t("sky.hollywoodHint");
    case "newyork":
      return t("sky.newyorkHint");
    case "lava":
      return t("sky.lavaHint");
    case "carnival":
      return t("sky.carnivalHint");
    case "starry":
      return t("sky.starryHint");
    case "candy":
      return t("sky.candyHint");
    default:
      return t("sky.spaceHint");
  }
}

const CARNIVAL_STOPS = [
  [-1, "#2a1038"],
  [-0.2, "#6a1848"],
  [-0.02, "#ff6a3a"],
  [0.06, "#ffb04a"],
  [0.2, "#ff7eb3"],
  [0.48, "#c45cff"],
  [1, "#3a1d78"],
];
const STARRY_STOPS = [
  [-1, "#05060f"],
  [-0.08, "#0c1030"],
  [0.05, "#1a2458"],
  [0.35, "#24186a"],
  [0.7, "#120e40"],
  [1, "#090818"],
];
const CANDY_STOPS = [
  [-1, "#ffd0e8"],
  [-0.08, "#fff0c8"],
  [0.06, "#fff6ea"],
  [0.28, "#d7f3ff"],
  [0.62, "#9fd4ff"],
  [1, "#7ec8ff"],
];

/** Holiday skies sit inside the world sky. Hide them while a coaster sky is up, then let them go. */
const SEASON_COVERS = [
  "valentinesSky",
  "valentinesStars",
  "halloweenSky",
  "halloweenStars",
  "thanksgivingSky",
  "christmasSky",
  "christmasStars",
];

/**
 * Skies the yard can wear. Obby backdrops are drawn by the world; carnival, starry, and candy
 * are meshes parked on the sky sphere, far past the track, with no colliders.
 * Leaving the yard (or picking Space) puts the usual look back and does not touch the obby backdrop.
 */
export function bindCoasterSky(scene, coaster, world, graphics) {
  const root = new TransformNode("coaster-sky", scene);
  const groups = {
    carnival: buildCarnival(scene, root),
    starry: buildStarry(scene, root),
    candy: buildCandy(scene, root),
  };
  root.setEnabled(false);

  const layer = graphics?.pipeline?.glowLayer;
  for (const mesh of root.getChildMeshes(false)) {
    world.glowExcluded.push(mesh);
    layer?.addExcludedMesh(mesh);
  }

  const open = document.querySelector("#coaster-sky-open");
  const picker = document.querySelector("#coaster-sky-picker");
  const list = document.querySelector("#coaster-sky-list");
  const glyph = open?.querySelector("[data-sky-glyph]");
  let current = isCoasterSky(coaster.upgrades.sky) ? coaster.upgrades.sky : "space";
  // Visibility we borrowed from a holiday sky, put back the moment this sky steps aside.
  const covered = [];

  if (list) {
    for (const sky of COASTER_SKIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "coaster-sky-option";
      button.dataset.sky = sky.id;
      const swatch = document.createElement("span");
      swatch.className = "coaster-sky-swatch";
      swatch.style.background = sky.swatch;
      swatch.textContent = sky.emoji;
      swatch.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = t(sky.nameKey);
      const hint = document.createElement("small");
      hint.textContent = skyHint(sky.id);
      copy.append(name, hint);
      button.append(swatch, copy);
      button.addEventListener("click", () => choose(sky.id));
      list.append(button);
    }
  }
  open?.addEventListener("click", () => {
    if (!picker) return;
    open.blur();
    const show = picker.hidden;
    picker.hidden = !show;
    open.setAttribute("aria-expanded", String(show));
  });
  paint();

  function choose(id) {
    if (!isCoasterSky(id) || id === current) {
      paint();
      return;
    }
    current = id;
    coaster.upgrades.sky = id;
    coaster.saveUpgrades();
    paint();
  }

  function paint() {
    const sky = COASTER_SKIES.find((item) => item.id === current) ?? COASTER_SKIES[0];
    if (glyph) glyph.textContent = sky.emoji;
    list?.querySelectorAll("[data-sky]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.sky === current));
    });
  }

  function yardMode(id) {
    if (id === "hollywood" || id === "newyork" || id === "lava") return id;
    if (id === "carnival" || id === "starry" || id === "candy") return "overlay";
    return null;
  }

  function uncover() {
    for (const mesh of covered) mesh.visibility = mesh.metadata?.coasterSkyVis ?? 1;
    covered.length = 0;
  }

  function showGroup(id) {
    const custom = id === "carnival" || id === "starry" || id === "candy";
    root.setEnabled(custom);
    for (const [name, node] of Object.entries(groups)) node.setEnabled(name === id);
    if (!custom) return;
    const worldSky = scene.getMeshByName("sky");
    if (worldSky) root.position.copyFrom(worldSky.position);
  }

  return {
    /** Before world.update, so this frame's backdrop matches the yard. */
    sync(active) {
      world.setYardSky(active ? yardMode(current) : null);
    },
    /** After holiday skies update, so a coaster sky stays in front of them. */
    finish(active, time) {
      if (picker && (!active || coaster.riding)) {
        picker.hidden = true;
        open?.setAttribute("aria-expanded", "false");
      }
      const id = active ? current : "space";
      const show = id !== "space";
      uncover();
      if (!show) {
        showGroup("space");
        return;
      }
      for (const name of SEASON_COVERS) {
        const mesh = scene.getMeshByName(name);
        if (!mesh?.isEnabled() || mesh.visibility <= 0) continue;
        if (!mesh.metadata) mesh.metadata = {};
        mesh.metadata.coasterSkyVis = mesh.visibility;
        mesh.visibility = 0;
        covered.push(mesh);
      }
      showGroup(id);
      if (id === "carnival") spinCarnival(groups.carnival, time);
      else if (id === "candy") driftCandy(groups.candy, time);
      else if (id === "starry") groups.starry.rotation.y = time * 0.01;
      if (id === "hollywood") scene.getMeshByName("rainbowRoot")?.setEnabled(true);
    },
  };
}

function spinCarnival(node, time) {
  const spin = node.getScene().getTransformNodeByName("coaster-ferris-spin");
  if (spin) spin.rotation.y = time * 0.35;
  for (const mesh of node.getChildMeshes(false)) {
    const bob = mesh.metadata?.bob;
    if (bob == null || mesh.metadata.baseY == null) continue;
    mesh.position.y = mesh.metadata.baseY + Math.sin(time * 1.4 + bob) * 7;
  }
}

function driftCandy(node, time) {
  for (const mesh of node.getChildMeshes(false)) {
    const phase = mesh.metadata?.bob;
    if (phase == null || mesh.metadata.baseX == null) continue;
    mesh.position.x = mesh.metadata.baseX + Math.sin(time * 0.18 + phase) * 10;
  }
}

function emissive(scene, mesh, hex) {
  const material = new StandardMaterial(`${mesh.name}-mat`, scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.FromHexString(hex);
  material.disableLighting = true;
  material.fogEnabled = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  return mesh;
}

function sphere(scene, name, parent, hex, diameter, x, y, z, bob = null) {
  const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 14 }, scene);
  mesh.parent = parent;
  mesh.position.set(x, y, z);
  if (bob != null) mesh.metadata = { bob, baseY: y, baseX: x };
  return emissive(scene, mesh, hex);
}

function buildCarnival(scene, root) {
  const node = new TransformNode("coaster-sky-carnival", scene);
  node.parent = root;
  const sky = buildGradientSky(scene, "coasterSkyCarnival", stops(CARNIVAL_STOPS));
  sky.parent = node;
  sphere(scene, "coaster-sun", node, "#ffd56a", 56, 90, 130, 660);
  const balloons = [
    ["#ff4d8d", 16, -300, 170, 560, 0.2],
    ["#ffd23f", 11, -250, 210, 610, 1.3],
    ["#7dcea0", 13, -340, 140, 520, 2.2],
    ["#b79cff", 12, 280, 190, 590, 0.7],
    ["#5bb8ff", 14, 330, 150, 540, 1.8],
  ];
  for (const [hex, size, x, y, z, phase] of balloons) {
    sphere(scene, "coaster-balloon", node, hex, size, x, y, z, phase);
  }
  const tilt = new TransformNode("coaster-ferris-tilt", scene);
  tilt.parent = node;
  tilt.position.set(-420, 100, 560);
  tilt.rotation.x = Math.PI / 2;
  const spin = new TransformNode("coaster-ferris-spin", scene);
  spin.parent = tilt;
  const wheel = MeshBuilder.CreateTorus("coaster-ferris", { diameter: 52, thickness: 1.8, tessellation: 28 }, scene);
  wheel.parent = spin;
  emissive(scene, wheel, "#ff4d8d");
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const car = MeshBuilder.CreateSphere("coaster-gondola", { diameter: 4.2, segments: 8 }, scene);
    car.parent = spin;
    car.position.set(Math.cos(angle) * 24, 0, Math.sin(angle) * 24);
    emissive(scene, car, i % 2 ? "#ffd23f" : "#fff6ea");
  }
  node.setEnabled(false);
  return node;
}

function buildStarry(scene, root) {
  const node = new TransformNode("coaster-sky-starry", scene);
  node.parent = root;
  const sky = buildGradientSky(scene, "coasterSkyStarry", stops(STARRY_STOPS));
  sky.parent = node;
  const stars = buildStarField(scene, "coasterSkyStars");
  stars.parent = node;
  sphere(scene, "coaster-moon", node, "#fff6d2", 38, 260, 340, -520);
  node.setEnabled(false);
  return node;
}

function buildCandy(scene, root) {
  const node = new TransformNode("coaster-sky-candy", scene);
  node.parent = root;
  const sky = buildGradientSky(scene, "coasterSkyCandy", stops(CANDY_STOPS));
  sky.parent = node;
  const puffs = [
    ["#fffafc", 46, 480, 80, 260, 0.4],
    ["#ffe4f2", 32, 520, 120, 220, 1.1],
    ["#fffafc", 28, 440, 150, 300, 2],
    ["#e7f6ff", 40, -460, 90, 300, 0.6],
    ["#fff0f6", 30, -500, 140, 240, 1.6],
    ["#fffafc", 36, 80, 200, -520, 1.2],
    ["#ffeaf6", 26, 140, 240, -480, 2.4],
    ["#e7f6ff", 34, -120, 180, 560, 0.3],
  ];
  for (const [hex, size, x, y, z, phase] of puffs) {
    sphere(scene, "coaster-cloud", node, hex, size, x, y, z, phase);
  }
  node.setEnabled(false);
  return node;
}

function stops(rows) {
  return rows.map(([at, hex]) => [at, Color3.FromHexString(hex)]);
}
